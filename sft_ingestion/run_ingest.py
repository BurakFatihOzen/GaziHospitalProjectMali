"""
run_ingest.py
=============
Gazi Üniversitesi Çocuk Alerji Kliniği — SFT MVP Ingestion Katmanı
CLI Toplu İşlem Betiği

Bir klasördeki tüm Vyaire XML dosyalarını okur, SHA-256 ile mükerrer
dosyaları atlar ve her dosyayı atomik transaction ile veritabanına yazar.

Kullanım:
  # Sadece bağlantı testi
  python run_ingest.py --input-dir ./mock_xmls --dsn "postgresql://..." --dry-run

  # Normal ingest (tek dizin)
  python run_ingest.py --input-dir ./mock_xmls

  # Ortam değişkeninden DSN al, özyinelemeli tarama
  DATABASE_URL="postgresql://postgres:pass@localhost:5432/sft_db" \
  python run_ingest.py --input-dir ./mock_xmls --recursive

  # Sonraki çalıştırmada mükerrerleri atlar (idempotent)
  python run_ingest.py --input-dir ./mock_xmls

Bağımlılıklar:
  pip install lxml psycopg2-binary python-dotenv
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys

# Windows cp1254 terminal için UTF-8 desteği
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import psycopg2

from parser import (
    VyaireXMLParser,
    DBWriter,
    get_connection,
    PARSER_VERSION,
)

# ---------------------------------------------------------------------------
# LOGLAMA
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("sft.ingest")


# ---------------------------------------------------------------------------
# İNGESTION SONUÇ NESNESİ
# ---------------------------------------------------------------------------
@dataclass
class FileResult:
    filename: str
    sha256: str
    status: str          # SUCCESS | SKIPPED_DUPLICATE | FAILED_QUARANTINE
    patient_external_id: Optional[str] = None
    patient_db_id: Optional[int]       = None
    error_message: Optional[str]       = None
    duration_ms: float                 = 0.0


@dataclass
class IngestionSummary:
    started_at: str       = ""
    finished_at: str      = ""
    input_dir: str        = ""
    total_files: int      = 0
    success: int          = 0
    skipped_duplicates: int = 0
    failed: int           = 0
    results: list[FileResult] = field(default_factory=list)


# ---------------------------------------------------------------------------
# SHA-256 HESAPLAYICI
# ---------------------------------------------------------------------------
def compute_sha256(path: Path) -> str:
    """Dosyanın SHA-256 özetini hex string olarak döndürür."""
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# TEK DOSYA INGEST
# ---------------------------------------------------------------------------
def ingest_file(
    path: Path,
    conn: psycopg2.extensions.connection,
    dry_run: bool = False,
) -> FileResult:
    """
    Tek bir XML dosyasını veritabanına yazar.

    Adımlar:
      1. SHA-256 hesapla
      2. source_document'ta mükerrer kontrolü yap
      3. XML'i ayrıştır (VyaireXMLParser)
      4. Atomik transaction ile DB'ye yaz (DBWriter)
      5. source_document.import_status güncelle
    """
    t_start = datetime.now(tz=timezone.utc)
    logger.info("İşleniyor: %s", path.name)

    sha256 = compute_sha256(path)
    result = FileResult(filename=path.name, sha256=sha256, status="PENDING")

    writer = DBWriter(conn)

    # --- Mükerrer Kontrolü ---
    if writer.check_sha256_exists(sha256):
        logger.info("  ↳ [ATLA] Mükerrer (SHA-256 zaten mevcut): %s", path.name)
        result.status = "SKIPPED_DUPLICATE"
        t_end = datetime.now(tz=timezone.utc)
        result.duration_ms = (t_end - t_start).total_seconds() * 1000
        return result

    if dry_run:
        logger.info("  ↳ [DRY-RUN] Veritabanına yazılmayacak: %s", path.name)
        result.status = "SUCCESS"
        t_end = datetime.now(tz=timezone.utc)
        result.duration_ms = (t_end - t_start).total_seconds() * 1000
        return result

    # --- Source Document Kaydı Oluştur ---
    doc_id: Optional[int] = None
    try:
        doc_id = writer.create_source_document(
            sha256=sha256,
            original_name=path.name,
        )
        conn.commit()   # Source document satırı güvenceye alındı
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        logger.warning("  ↳ [ATLA] Race condition — SHA-256 zaten eklendi: %s", path.name)
        result.status = "SKIPPED_DUPLICATE"
        t_end = datetime.now(tz=timezone.utc)
        result.duration_ms = (t_end - t_start).total_seconds() * 1000
        return result

    # --- XML Ayrıştırma + Veritabanı Yazma (Tek Transaction) ---
    try:
        raw_bytes = path.read_bytes()
        parser    = VyaireXMLParser(raw_bytes)
        patient_dto = parser.parse()

        # Atomik transaction başlat
        with conn:   # psycopg2 context manager: başarıda commit, hata da rollback
            patient_id = writer.write_patient_tree(patient_dto, doc_id)
            writer.update_source_document_status(doc_id, "SUCCESS")

        result.status             = "SUCCESS"
        result.patient_external_id = patient_dto.external_id
        result.patient_db_id      = patient_id

        logger.info(
            "  ↳ [OK] %s | Hasta: %s (%s) | %d ziyaret",
            path.name,
            patient_dto.external_id,
            f"{patient_dto.first_name} {patient_dto.last_name}".strip(),
            len(patient_dto.visits),
        )

    except Exception as exc:  # noqa: BLE001
        conn.rollback()
        error_msg = f"{type(exc).__name__}: {exc}"
        logger.error("  ↳ [HATA] %s — %s", path.name, error_msg)
        logger.debug(traceback.format_exc())

        # Source document'ı karantina durumuna al
        try:
            writer.update_source_document_status(doc_id, "FAILED_QUARANTINE", str(exc))
            conn.commit()
        except Exception:
            conn.rollback()

        result.status        = "FAILED_QUARANTINE"
        result.error_message = error_msg

    t_end = datetime.now(tz=timezone.utc)
    result.duration_ms = (t_end - t_start).total_seconds() * 1000
    return result


# ---------------------------------------------------------------------------
# TOPLU INGEST
# ---------------------------------------------------------------------------
def ingest_directory(
    input_dir: Path,
    conn: psycopg2.extensions.connection,
    recursive: bool = False,
    dry_run: bool = False,
    file_pattern: str = "*.xml",
) -> IngestionSummary:
    """
    Belirtilen dizindeki tüm XML dosyalarını sırayla işler.

    Returns:
        IngestionSummary: Tüm işlem sonuçlarını içeren özet nesnesi.
    """
    summary = IngestionSummary(
        started_at=datetime.now(tz=timezone.utc).isoformat(),
        input_dir=str(input_dir),
    )

    glob_fn = input_dir.rglob if recursive else input_dir.glob
    xml_files = sorted(glob_fn(file_pattern))

    if not xml_files:
        logger.warning("'%s' dizininde %s kalıbına uyan dosya bulunamadı.", input_dir, file_pattern)
        summary.finished_at = datetime.now(tz=timezone.utc).isoformat()
        return summary

    summary.total_files = len(xml_files)
    logger.info("=" * 60)
    logger.info("Gazi SFT Ingestion — %d dosya bulundu", summary.total_files)
    logger.info("Dizin  : %s", input_dir)
    logger.info("Dry-run: %s", "EVET" if dry_run else "HAYIR")
    logger.info("=" * 60)

    for i, xml_path in enumerate(xml_files, start=1):
        logger.info("[%d/%d] ─────────────────────────────────", i, summary.total_files)
        result = ingest_file(xml_path, conn, dry_run=dry_run)
        summary.results.append(result)

        if result.status == "SUCCESS":
            summary.success += 1
        elif result.status == "SKIPPED_DUPLICATE":
            summary.skipped_duplicates += 1
        else:
            summary.failed += 1

    summary.finished_at = datetime.now(tz=timezone.utc).isoformat()
    return summary


# ---------------------------------------------------------------------------
# RAPOR ÇIKIŞI
# ---------------------------------------------------------------------------
def print_summary(summary: IngestionSummary, json_out: bool = False) -> None:
    """İşlem özetini konsola yazdırır."""
    if json_out:
        print(json.dumps(asdict(summary), indent=2, ensure_ascii=False, default=str))
        return

    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║       GAZİ SFT INGESTION — ÖZET RAPORU              ║")
    print("╠══════════════════════════════════════════════════════╣")
    print(f"║  Başlangıç : {summary.started_at[:19]:<38} ║")
    print(f"║  Bitiş     : {summary.finished_at[:19]:<38} ║")
    print(f"║  Dizin     : {str(summary.input_dir)[:38]:<38} ║")
    print("╠══════════════════════════════════════════════════════╣")
    print(f"║  Toplam Dosya    : {summary.total_files:<33} ║")
    print(f"║  ✓ Başarılı      : {summary.success:<33} ║")
    print(f"║  ↷ Mükerrer Atla : {summary.skipped_duplicates:<33} ║")
    print(f"║  ✗ Hata/Karantina: {summary.failed:<33} ║")
    print("╠══════════════════════════════════════════════════════╣")

    if summary.results:
        print("║  DETAY                                               ║")
        for r in summary.results:
            icon = "✓" if r.status == "SUCCESS" else ("↷" if "SKIP" in r.status else "✗")
            ms_str = f"{r.duration_ms:.0f} ms"
            name_short = r.filename[:28]
            print(f"║  {icon} {name_short:<29} {ms_str:>8}           ║")
            if r.error_message:
                err_short = r.error_message[:50]
                print(f"║    ↳ {err_short:<48} ║")

    print("╚══════════════════════════════════════════════════════╝")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="run_ingest",
        description="Gazi SFT — Vyaire XML Toplu Ingest CLI",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument(
        "--input-dir", "-i",
        type=Path,
        required=True,
        help="İşlenecek XML dosyalarının bulunduğu dizin",
    )
    p.add_argument(
        "--dsn",
        type=str,
        default=None,
        help="PostgreSQL DSN (örn: postgresql://user:pass@host:5432/db). "
             "Belirtilmezse DATABASE_URL ortam değişkeni kullanılır.",
    )
    p.add_argument(
        "--recursive", "-r",
        action="store_true",
        default=False,
        help="Alt dizinleri de tara",
    )
    p.add_argument(
        "--pattern",
        type=str,
        default="*.xml",
        help="Dosya kalıbı (glob)",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Veritabanına yazmadan SHA-256 kontrolü ve parse doğrulaması yap",
    )
    p.add_argument(
        "--json",
        action="store_true",
        default=False,
        help="Özet raporu JSON formatında çıkar",
    )
    p.add_argument(
        "--log-level",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default="INFO",
        help="Log seviyesi",
    )
    return p


def main() -> int:
    arg_parser = build_arg_parser()
    args = arg_parser.parse_args()

    logging.getLogger().setLevel(args.log_level)

    # Dizin kontrolü
    if not args.input_dir.exists():
        logger.error("Dizin mevcut değil: %s", args.input_dir)
        return 2
    if not args.input_dir.is_dir():
        logger.error("Belirtilen yol bir dizin değil: %s", args.input_dir)
        return 2

    # Veritabanı bağlantısı
    if args.dry_run:
        logger.info("DRY-RUN modu aktif — veritabanı bağlantısı gerekmez.")
        conn = None
    else:
        try:
            conn = get_connection(args.dsn)
            logger.info("Veritabanı bağlantısı sağlandı.")
        except Exception as exc:
            logger.error("Veritabanı bağlantısı kurulamadı: %s", exc)
            return 1

    # Toplu işlem
    try:
        summary = ingest_directory(
            input_dir=args.input_dir,
            conn=conn,       # type: ignore[arg-type]
            recursive=args.recursive,
            dry_run=args.dry_run,
            file_pattern=args.pattern,
        )
    finally:
        if conn is not None:
            conn.close()
            logger.debug("Veritabanı bağlantısı kapatıldı.")

    print_summary(summary, json_out=args.json)

    # Exit kodu: hata varsa non-zero
    return 0 if summary.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
