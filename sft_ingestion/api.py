"""
api.py
======
Gazi Üniversitesi Çocuk Alerji Kliniği — SFT Klinik Sorgu ve Görselleştirme API'si
FastAPI uygulaması — Tek dosya, üretime hazır.

Endpoint'ler:
  GET  /api/cohort            — Parametrik kohort sorgulama (mv_spirometry_best_trial)
  GET  /api/cohort/export     — Kohort sonuçlarını Excel (.xlsx) olarak indir
  GET  /api/curves/{trial_id} — Eğri koordinatlarını grafik-uyumlu JSON olarak döndür
  POST /api/upload            — Tekil/çoklu Vyaire XML yükleme ve ingest

Çalıştırma:
  uvicorn api:app --reload --host 0.0.0.0 --port 8000

Bağımlılıklar:
  pip install fastapi "uvicorn[standard]" openpyxl python-multipart psycopg2-binary lxml python-dotenv
"""

from __future__ import annotations

import hashlib
import io
import logging
import os
import traceback
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from pydantic import BaseModel

from parser import DBWriter, VyaireXMLParser

# ---------------------------------------------------------------------------
# ORTAM VE LOGLAMA
# ---------------------------------------------------------------------------
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("sft.api")

DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/sft_db",
)


# ---------------------------------------------------------------------------
# VERİTABANI BAĞLANTI YÖNETİCİSİ
# ---------------------------------------------------------------------------
def _get_conn() -> psycopg2.extensions.connection:
    """Her istek için yeni bir psycopg2 bağlantısı açar."""
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn


# ---------------------------------------------------------------------------
# PYDANTIC YANIT MODELLERİ
# ---------------------------------------------------------------------------
class CohortPatient(BaseModel):
    """mv_spirometry_best_trial'dan gelen tek bir kayıt."""

    patient_id: int
    external_id: str
    first_name: str | None
    last_name: str | None
    birth_date: str | None  # ISO 8601 string
    ethnic_group: str | None
    visit_id: int
    visit_datetime: str | None
    age: int | None
    biological_gender: str | None
    height_m: float | None
    weight_kg: float | None
    prediction_module: str | None
    level_type: str  # 'Pre' | 'Post'
    trial_id: int
    fev1_val: float | None
    fvc_val: float | None
    fev1_fvc_ratio: float | None
    pef_val: float | None
    fev1_pred_percent: float | None
    fvc_pred_percent: float | None
    reversibility_positive: bool | None = None  # API katmanında hesaplanır


class CohortResponse(BaseModel):
    total: int
    filters_applied: dict[str, Any]
    results: list[CohortPatient]


class CurvePoint(BaseModel):
    x: float
    y: float


class CurveGroup(BaseModel):
    curve_id: int
    trial_id: int
    curve_type: str
    curve_scope: str
    data_type: str
    x_unit: str
    y_unit: str
    sample_rate: str
    point_count: int
    points: list[CurvePoint]


class CurvesResponse(BaseModel):
    trial_id: int
    curves: list[CurveGroup]


class UploadResult(BaseModel):
    filename: str
    sha256: str
    status: str  # SUCCESS | SKIPPED_DUPLICATE | FAILED_QUARANTINE
    patient_external_id: str | None
    patient_db_id: int | None
    error_message: str | None
    duration_ms: float


class UploadResponse(BaseModel):
    total_uploaded: int
    success: int
    skipped_duplicates: int
    failed: int
    results: list[UploadResult]


# ---------------------------------------------------------------------------
# UYGULAMA
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Uygulama başlangıç / bitiş kancası."""
    logger.info("Gazi SFT API basliyor... DB: %s", DATABASE_URL.split("@")[-1])
    yield
    logger.info("Gazi SFT API kapatiliyor.")


app = FastAPI(
    title="Gazi Çocuk Alerji Kliniği — SFT Klinik API",
    description=(
        "Vyaire spirometri verilerini sorgulayan, eğri görselleştiren "
        "ve Excel raporu üreten klinik karar destek API'si."
    ),
    version="1.0.0",
    contact={
        "name": "Gazi Üniversitesi Tıp Fakültesi Çocuk Alerji BD",
        "url": "https://hastane.gazi.edu.tr",
    },
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — tüm localhost portlarına izin ver
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# YARDIMCI: Dinamik WHERE cümlesi oluşturucu (SQL Injection korumalı)
# ---------------------------------------------------------------------------
def _build_cohort_where(
    min_age: int | None,
    max_age: int | None,
    gender: str | None,
    min_fev1_pred: float | None,
    max_fev1_pred: float | None,
    min_fvc_pred: float | None,
    max_fvc_pred: float | None,
    level_type: str | None,
) -> tuple[str, list[Any]]:
    """
    Verilen filtrelerden güvenli parametrik WHERE cümlesi üretir.
    Tüm değerler %s placeholder'ı ile enjeksiyona karşı korunur.

    Returns:
        (where_clause_str, params_list)
    """
    clauses: list[str] = []
    params: list[Any] = []

    if min_age is not None:
        clauses.append("age >= %s")
        params.append(min_age)
    if max_age is not None:
        clauses.append("age <= %s")
        params.append(max_age)
    if gender:
        # İzin verilen değerler dışındakileri reddet
        allowed_genders = {"Male", "Female", "male", "female"}
        if gender not in allowed_genders:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Geçersiz gender değeri: '{gender}'. İzin verilenler: Male, Female",
            )
        clauses.append("biological_gender ILIKE %s")
        params.append(gender)
    if min_fev1_pred is not None:
        clauses.append("fev1_pred_percent >= %s")
        params.append(min_fev1_pred)
    if max_fev1_pred is not None:
        clauses.append("fev1_pred_percent <= %s")
        params.append(max_fev1_pred)
    if min_fvc_pred is not None:
        clauses.append("fvc_pred_percent >= %s")
        params.append(min_fvc_pred)
    if max_fvc_pred is not None:
        clauses.append("fvc_pred_percent <= %s")
        params.append(max_fvc_pred)
    if level_type:
        allowed_levels = {"Pre", "Post", "pre", "post"}
        if level_type not in allowed_levels:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Geçersiz level_type: '{level_type}'. İzin verilenler: Pre, Post",
            )
        clauses.append("level_type ILIKE %s")
        params.append(level_type)

    where_str = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    return where_str, params


def _row_to_cohort_patient(row: tuple, cols: list[str]) -> CohortPatient:
    """psycopg2 tuple satırını CohortPatient modeline dönüştürür."""
    d = dict(zip(cols, row))
    # datetime nesnelerini ISO string'e çevir
    for dt_col in ("birth_date", "visit_datetime"):
        if d.get(dt_col) is not None:
            val = d[dt_col]
            d[dt_col] = val.isoformat() if hasattr(val, "isoformat") else str(val)
    return CohortPatient(**d)


def _compute_reversibility(
    conn: psycopg2.extensions.connection,
    pre_rows: list[dict],
) -> dict[int, bool]:
    """
    Pre-level trial_id listesi için Post eşleşmesi bulup
    reversibilite durumunu hesaplar.
    Pre-to-Post FEV1 artışı: delta_fev1 > 200 mL (0.2 L) VE % artış >= 12.
    ATS/ERS 2019 çocuk kriteri.

    Returns: {pre_trial_id: bool}
    """
    if not pre_rows:
        return {}

    # Her hastanın Pre karşısındaki Post'unu bul
    patient_ids = list({r["patient_id"] for r in pre_rows})
    sql = """
        SELECT patient_id, visit_id, fev1_val, fev1_pred_percent, trial_id
          FROM mv_spirometry_best_trial
         WHERE level_type = 'Post'
           AND patient_id = ANY(%s)
    """
    post_map: dict[tuple[int, int], dict] = {}  # (patient_id, visit_id) -> row
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, (patient_ids,))
        for pr in cur.fetchall():
            key = (pr["patient_id"], pr["visit_id"])
            post_map[key] = pr

    result: dict[int, bool] = {}
    for row in pre_rows:
        key = (row["patient_id"], row["visit_id"])
        pre_fev1 = row.get("fev1_val")
        post = post_map.get(key)
        if pre_fev1 and post and post.get("fev1_val"):
            post_fev1 = post["fev1_val"]
            delta_l = post_fev1 - pre_fev1
            pct_change = (delta_l / pre_fev1) * 100 if pre_fev1 > 0 else 0
            result[row["trial_id"]] = delta_l >= 0.2 and pct_change >= 12.0
        else:
            result[row["trial_id"]] = False

    return result


# ---------------------------------------------------------------------------
# ENDPOINT 1: GET /api/cohort
# ---------------------------------------------------------------------------
@app.get(
    "/api/cohort",
    response_model=CohortResponse,
    summary="Parametrik kohort sorgulama",
    tags=["Klinik Sorgulama"],
)
def get_cohort(
    min_age: int | None = Query(None, ge=0, le=18, description="Minimum yaş (dahil)"),
    max_age: int | None = Query(None, ge=0, le=18, description="Maksimum yaş (dahil)"),
    gender: str | None = Query(None, description="Cinsiyet: Male | Female"),
    min_fev1_pred: float | None = Query(None, ge=0, le=200, description="FEV1 %Pred minimum"),
    max_fev1_pred: float | None = Query(None, ge=0, le=200, description="FEV1 %Pred maksimum"),
    min_fvc_pred: float | None = Query(None, ge=0, le=200, description="FVC %Pred minimum"),
    max_fvc_pred: float | None = Query(None, ge=0, le=200, description="FVC %Pred maksimum"),
    reversibility_positive: bool | None = Query(None, description="Bronkodilatör reversibilitesi pozitif mi?"),
    level_type: str | None = Query("Pre", description="Ölçüm seviyesi: Pre | Post"),
    limit: int = Query(200, ge=1, le=2000, description="Maksimum kayıt sayısı"),
    offset: int = Query(0, ge=0, description="Sayfalama başlangıcı"),
) -> CohortResponse:
    """
    `mv_spirometry_best_trial` materialized view üzerinden dinamik
    parametrik kohort sorgusu çalıştırır.

    Tüm filtreler opsiyoneldir; belirtilmeyenler görmezden gelinir.
    Reversibilite filtresi Python katmanında Pre/Post karşılaştırmasıyla hesaplanır.
    """
    where_clause, params = _build_cohort_where(
        min_age,
        max_age,
        gender,
        min_fev1_pred,
        max_fev1_pred,
        min_fvc_pred,
        max_fvc_pred,
        level_type,
    )

    sql = f"""
        SELECT
            patient_id, external_id, first_name, last_name,
            birth_date, ethnic_group,
            visit_id, visit_datetime, age, biological_gender,
            height_m, weight_kg, prediction_module,
            level_type, trial_id,
            fev1_val, fvc_val, fev1_fvc_ratio, pef_val,
            fev1_pred_percent, fvc_pred_percent
        FROM mv_spirometry_best_trial
        {where_clause}
        ORDER BY visit_datetime DESC, patient_id
        LIMIT %s OFFSET %s
    """
    params_full = params + [limit, offset]

    count_sql = f"SELECT COUNT(*) FROM mv_spirometry_best_trial {where_clause}"

    cols = [
        "patient_id",
        "external_id",
        "first_name",
        "last_name",
        "birth_date",
        "ethnic_group",
        "visit_id",
        "visit_datetime",
        "age",
        "biological_gender",
        "height_m",
        "weight_kg",
        "prediction_module",
        "level_type",
        "trial_id",
        "fev1_val",
        "fvc_val",
        "fev1_fvc_ratio",
        "pef_val",
        "fev1_pred_percent",
        "fvc_pred_percent",
    ]

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(count_sql, params)
            total: int = cur.fetchone()[0]
            cur.execute(sql, params_full)
            rows = cur.fetchall()

        patients = [_row_to_cohort_patient(row, cols) for row in rows]

        # Reversibilite hesaplama (ATS/ERS 2019)
        if level_type in (None, "Pre", "pre"):
            raw_dicts = [dict(zip(cols, r)) for r in rows]
            rev_map = _compute_reversibility(conn, raw_dicts)
            filtered: list[CohortPatient] = []
            for p in patients:
                rev = rev_map.get(p.trial_id, False)
                p.reversibility_positive = rev
                if (
                    reversibility_positive is True
                    and rev
                    or reversibility_positive is False
                    and not rev
                    or reversibility_positive is None
                ):
                    filtered.append(p)
            patients = filtered
            if reversibility_positive is not None:
                total = len(patients)  # Filtre uygulandıysa güncelle
        else:
            # Post seviyesinde reversibilite hesaplanmaz
            for p in patients:
                p.reversibility_positive = None

        applied: dict[str, Any] = {
            k: v
            for k, v in {
                "min_age": min_age,
                "max_age": max_age,
                "gender": gender,
                "min_fev1_pred": min_fev1_pred,
                "max_fev1_pred": max_fev1_pred,
                "min_fvc_pred": min_fvc_pred,
                "max_fvc_pred": max_fvc_pred,
                "reversibility_positive": reversibility_positive,
                "level_type": level_type,
                "limit": limit,
                "offset": offset,
            }.items()
            if v is not None
        }

        return CohortResponse(total=total, filters_applied=applied, results=patients)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Kohort sorgulama hatasi: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sorgu hatasi: {type(exc).__name__}",
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# ENDPOINT 2: GET /api/cohort/export
# ---------------------------------------------------------------------------
@app.get(
    "/api/cohort/export",
    summary="Kohort sonuçlarını Excel olarak indir",
    tags=["Klinik Sorgulama"],
    response_class=StreamingResponse,
)
def export_cohort(
    min_age: int | None = Query(None, ge=0, le=18),
    max_age: int | None = Query(None, ge=0, le=18),
    gender: str | None = Query(None),
    min_fev1_pred: float | None = Query(None, ge=0, le=200),
    max_fev1_pred: float | None = Query(None, ge=0, le=200),
    min_fvc_pred: float | None = Query(None, ge=0, le=200),
    max_fvc_pred: float | None = Query(None, ge=0, le=200),
    level_type: str | None = Query("Pre"),
) -> StreamingResponse:
    """
    Kohort sorgusundaki aynı filtrelerle veritabanından çekilen sonuçları
    klinik sütun başlıklarıyla biçimlendirilmiş `.xlsx` olarak döndürür.
    """
    where_clause, params = _build_cohort_where(
        min_age,
        max_age,
        gender,
        min_fev1_pred,
        max_fev1_pred,
        min_fvc_pred,
        max_fvc_pred,
        level_type,
    )

    sql = f"""
        SELECT
            external_id, first_name, last_name, birth_date, age,
            biological_gender, height_m, weight_kg, prediction_module,
            level_type, visit_datetime,
            fev1_val, fvc_val, fev1_fvc_ratio, pef_val,
            fev1_pred_percent, fvc_pred_percent
        FROM mv_spirometry_best_trial
        {where_clause}
        ORDER BY visit_datetime DESC, external_id
        LIMIT 5000
    """

    # Klinik sütun başlıkları (Türkçe)
    HEADERS = [
        "Protokol No",
        "Ad",
        "Soyad",
        "Doğum Tarihi",
        "Test Yaşı",
        "Cinsiyet",
        "Boy (m)",
        "Kilo (kg)",
        "Referans Modülü",
        "Seviye (Pre/Post)",
        "Test Tarihi",
        "FEV1 (L)",
        "FVC (L)",
        "FEV1/FVC (%)",
        "PEF (L/s)",
        "FEV1 %Pred",
        "FVC %Pred",
    ]

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
    except Exception as exc:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Veritabanı hatası: {exc}",
        )
    finally:
        conn.close()

    # ----- Excel oluştur -----
    wb = Workbook()
    ws = wb.active
    ws.title = "SFT Kohort Raporu"

    # Başlık satırı biçimlendirmesi
    HEADER_FILL = PatternFill("solid", fgColor="003366")  # Gazi Lacivert
    HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
    HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)
    DATA_FONT = Font(size=10)
    DATA_ALIGN = Alignment(horizontal="left", vertical="center")
    ALT_FILL = PatternFill("solid", fgColor="EEF2F7")  # Açık mavi-gri

    ws.row_dimensions[1].height = 32
    for col_idx, header in enumerate(HEADERS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=header)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = HEADER_ALIGN

    # Veri satırları
    for row_idx, row in enumerate(rows, start=2):
        is_alt = row_idx % 2 == 0
        for col_idx, val in enumerate(row, start=1):
            # datetime / date -> string dönüşümü
            if hasattr(val, "isoformat"):
                val = val.isoformat()
            cell = ws.cell(row=row_idx, column=col_idx, value=val)
            cell.font = DATA_FONT
            cell.alignment = DATA_ALIGN
            if is_alt:
                cell.fill = ALT_FILL

    # Sütun genişlikleri otomatik ayar
    COL_WIDTHS = [14, 12, 14, 14, 8, 10, 8, 9, 16, 14, 20, 10, 10, 12, 10, 10, 10]
    for col_idx, width in enumerate(COL_WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = width

    # Üst bilgi satırı dondur
    ws.freeze_panes = "A2"

    # Özet sayfası
    ws_meta = wb.create_sheet("Rapor Bilgisi")
    meta_rows = [
        ("Rapor Adı", "Gazi Çocuk Alerji Kliniği SFT Kohort Raporu"),
        ("Üretim Tarihi", datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")),
        ("Toplam Kayıt", len(rows)),
        ("Referans", "mv_spirometry_best_trial"),
        (
            "Filtreler",
            str(
                {
                    k: v
                    for k, v in {
                        "min_age": min_age,
                        "max_age": max_age,
                        "gender": gender,
                        "min_fev1_pred": min_fev1_pred,
                        "max_fev1_pred": max_fev1_pred,
                        "min_fvc_pred": min_fvc_pred,
                        "max_fvc_pred": max_fvc_pred,
                        "level_type": level_type,
                    }.items()
                    if v is not None
                }
            ),
        ),
    ]
    for mr in meta_rows:
        ws_meta.append(mr)

    # Buffer'a yaz
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%d_%H%M")
    filename = f"GaziSFT_Kohort_{timestamp}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Record-Count": str(len(rows)),
        },
    )


# ---------------------------------------------------------------------------
# ENDPOINT 3: GET /api/curves/{trial_id}
# ---------------------------------------------------------------------------
@app.get(
    "/api/curves/{trial_id}",
    response_model=CurvesResponse,
    summary="Deneme eğri koordinatlarını grafik-uyumlu JSON olarak döndür",
    tags=["Eğri Görselleştirme"],
)
def get_curves(
    trial_id: int,
    scope: str | None = Query(
        "REPORT",
        description="Eğri kapsamı: REPORT (görselleştirme ~200 pt) | RAW (arşiv 250 Hz) | ALL",
    ),
) -> CurvesResponse:
    """
    Belirli bir trial'ın akış-hacim eğri koordinatlarını döndürür.

    `scope=REPORT` (varsayılan): Poliklinikte eğri çizimi için optimize edilmiş ~200 nokta.
    `scope=RAW`   : Ham zaman-hacim verisi (250 Hz), bilimsel analiz için.
    `scope=ALL`   : Tüm eğriler.

    Dönen `points` listesi `[{"x": float, "y": float}, ...]` formatındadır;
    Recharts, Chart.js, Plotly gibi kütüphanelerle doğrudan kullanılabilir.
    """
    allowed_scopes = {"REPORT", "RAW", "ALL"}
    scope_upper = (scope or "REPORT").upper()
    if scope_upper not in allowed_scopes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Geçersiz scope: '{scope}'. Geçerli değerler: REPORT, RAW, ALL",
        )

    if scope_upper == "ALL":
        scope_filter = ""
        scope_params: list[Any] = [trial_id]
    else:
        scope_filter = "AND curve_scope = %s"
        scope_params = [trial_id, scope_upper]

    sql = f"""
        SELECT
            id AS curve_id,
            trial_id,
            curve_type,
            curve_scope,
            COALESCE(data_type, '')   AS data_type,
            COALESCE(x_unit, '')      AS x_unit,
            COALESCE(y_unit, '')      AS y_unit,
            COALESCE(sample_rate, '') AS sample_rate,
            COALESCE(point_count, 0)  AS point_count,
            x_points,
            y_points
        FROM curve
        WHERE trial_id = %s
          {scope_filter}
        ORDER BY curve_scope DESC, curve_type
    """

    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, scope_params)
            rows = cur.fetchall()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Eğri verisi alınamadı: {exc}",
        )
    finally:
        conn.close()

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"trial_id={trial_id} için eğri bulunamadı.",
        )

    curve_groups: list[CurveGroup] = []
    for row in rows:
        xs: list[float] = list(row["x_points"]) if row["x_points"] else []
        ys: list[float] = list(row["y_points"]) if row["y_points"] else []

        # Koordinat uzunlukları eşleşmeli
        n = min(len(xs), len(ys))
        points = [CurvePoint(x=xs[i], y=ys[i]) for i in range(n)]

        curve_groups.append(
            CurveGroup(
                curve_id=row["curve_id"],
                trial_id=row["trial_id"],
                curve_type=row["curve_type"] or "",
                curve_scope=row["curve_scope"] or "",
                data_type=row["data_type"],
                x_unit=row["x_unit"],
                y_unit=row["y_unit"],
                sample_rate=row["sample_rate"],
                point_count=len(points),
                points=points,
            )
        )

    return CurvesResponse(trial_id=trial_id, curves=curve_groups)


# ---------------------------------------------------------------------------
# ENDPOINT 4: POST /api/upload
# ---------------------------------------------------------------------------
@app.post(
    "/api/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_200_OK,
    summary="Vyaire XML dosyalarını yükle ve veritabanına aktar",
    tags=["Veri Aktarımı"],
)
async def upload_xml(
    files: list[UploadFile] = File(..., description="Bir veya daha fazla Vyaire XML dosyası"),
) -> UploadResponse:
    """
    Yüklenen her XML dosyasını ayrı bir işlemde parse edip veritabanına yazar.

    - SHA-256 mükerrer kontrolü yapılır; mükerrer dosyalar SKIPPED_DUPLICATE döner.
    - Her dosya bağımsız atomik transaction içinde işlenir; birinin hatası diğerini etkilemez.
    - Dönen JSON'da her dosya için ayrıntılı durum bilgisi verilir.
    """
    results: list[UploadResult] = []
    success = skipped = failed = 0

    for upload in files:
        t_start = datetime.now(tz=timezone.utc)
        filename = upload.filename or "unknown.xml"

        # Sadece .xml dosyalarına izin ver
        if not filename.lower().endswith(".xml"):
            results.append(
                UploadResult(
                    filename=filename,
                    sha256="",
                    status="FAILED_QUARANTINE",
                    patient_external_id=None,
                    patient_db_id=None,
                    error_message="Desteklenmeyen dosya türü: yalnızca .xml kabul edilir.",
                    duration_ms=0.0,
                )
            )
            failed += 1
            continue

        raw_bytes = await upload.read()

        # SHA-256 hesapla
        sha256 = hashlib.sha256(raw_bytes).hexdigest()

        conn = _get_conn()
        result = UploadResult(
            filename=filename,
            sha256=sha256,
            status="PENDING",
            patient_external_id=None,
            patient_db_id=None,
            error_message=None,
            duration_ms=0.0,
        )

        writer = DBWriter(conn)

        try:
            # Mükerrer kontrolü
            if writer.check_sha256_exists(sha256):
                result.status = "SKIPPED_DUPLICATE"
                skipped += 1
                logger.info("Upload atla (mukerrer): %s", filename)
                conn.close()
                t_end = datetime.now(tz=timezone.utc)
                result.duration_ms = (t_end - t_start).total_seconds() * 1000
                results.append(result)
                continue

            # Source document kaydı
            try:
                doc_id = writer.create_source_document(sha256=sha256, original_name=filename)
                conn.commit()
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                result.status = "SKIPPED_DUPLICATE"
                skipped += 1
                conn.close()
                t_end = datetime.now(tz=timezone.utc)
                result.duration_ms = (t_end - t_start).total_seconds() * 1000
                results.append(result)
                continue

            # Parse + DB yazma (atomik)
            try:
                parser = VyaireXMLParser(raw_bytes)
                patient_dto = parser.parse()

                with conn:
                    patient_id = writer.write_patient_tree(patient_dto, doc_id)
                    writer.update_source_document_status(doc_id, "SUCCESS")

                result.status = "SUCCESS"
                result.patient_external_id = patient_dto.external_id
                result.patient_db_id = patient_id
                success += 1
                logger.info("Upload basarili: %s -> hasta %s", filename, patient_dto.external_id)

            except Exception as parse_exc:
                conn.rollback()
                err_msg = f"{type(parse_exc).__name__}: {parse_exc}"
                logger.error("Upload parse hatasi: %s — %s", filename, err_msg)
                logger.debug(traceback.format_exc())

                try:
                    writer.update_source_document_status(doc_id, "FAILED_QUARANTINE", str(parse_exc))
                    conn.commit()
                except Exception:
                    conn.rollback()

                result.status = "FAILED_QUARANTINE"
                result.error_message = err_msg
                failed += 1

        except Exception as outer_exc:
            conn.rollback()
            result.status = "FAILED_QUARANTINE"
            result.error_message = f"{type(outer_exc).__name__}: {outer_exc}"
            failed += 1
        finally:
            conn.close()

        t_end = datetime.now(tz=timezone.utc)
        result.duration_ms = (t_end - t_start).total_seconds() * 1000
        results.append(result)

    # Başarılı yükleme varsa Materialized View'ı otomatik yenile
    if success > 0:
        conn_mv = _get_conn()
        try:
            with conn_mv.cursor() as cur:
                cur.execute("REFRESH MATERIALIZED VIEW mv_spirometry_best_trial;")
            conn_mv.commit()
            logger.info("mv_spirometry_best_trial basariyla yenilendi.")
        except Exception as mv_exc:
            logger.warning("Materialized View yenileme hatasi: %s", mv_exc)
        finally:
            conn_mv.close()

    return UploadResponse(
        total_uploaded=len(files),
        success=success,
        skipped_duplicates=skipped,
        failed=failed,
        results=results,
    )


# ---------------------------------------------------------------------------
# SAĞLIK KONTROLÜ
# ---------------------------------------------------------------------------
@app.get(
    "/health",
    summary="API ve veritabanı sağlık kontrolü",
    tags=["Sistem"],
    include_in_schema=False,
)
def health_check() -> dict[str, Any]:
    """Servis ve veritabanı bağlantı durumunu döndürür."""
    db_ok = False
    db_error: str | None = None
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        conn.close()
        db_ok = True
    except Exception as exc:
        db_error = str(exc)

    return {
        "status": "healthy" if db_ok else "degraded",
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "database": {
            "connected": db_ok,
            "error": db_error,
        },
        "version": app.version,
    }


# ---------------------------------------------------------------------------
# SÜRÜM BİLGİSİ
# ---------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {
        "app": app.title,
        "version": app.version,
        "docs": "/docs",
        "redoc": "/redoc",
    }
