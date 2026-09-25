"""
setup_db.py
===========
Gazi Üniversitesi Çocuk Alerji Kliniği — SFT Ingestion MVP
Veritabanı Hazırlama ve Şema Kurulum Betiği

İşlevler:
  1. sft_ingestion/.env veya varsayılan bağlantıdan DATABASE_URL okur.
  2. PostgreSQL sunucusuna bağlanarak hedef veritabanının (sft_db) varlığını kontrol eder,
     yoksa otomatik oluşturur (CREATE DATABASE).
  3. sft_ingestion/sql/init_schema.sql dosyasını çalıştırarak tabloları, indeksleri ve
     mv_spirometry_best_trial materialized view'ını kurar.
  4. Kurulum sonucunu ve oluşturulan nesneleri doğrular.
"""

import os
import sys
import pathlib
import urllib.parse
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

# UTF-8 stdout yapılandırması
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
ENV_PATH = SCRIPT_DIR / ".env"
SCHEMA_PATH = SCRIPT_DIR / "sql" / "init_schema.sql"


def load_env() -> None:
    """sft_ingestion/.env dosyasını ortam değişkenlerine yükler."""
    if ENV_PATH.exists():
        with open(ENV_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip('"').strip("'")
                    if key not in os.environ:
                        os.environ[key] = val


def parse_db_url(url: str):
    """DATABASE_URL dizesini ayrıştırarak bağlantı parametrelerini döner."""
    parsed = urllib.parse.urlparse(url)
    dbname = parsed.path.lstrip("/") or "sft_db"
    user = parsed.username or "postgres"
    password = parsed.password or ""
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    return {
        "dbname": dbname,
        "user": user,
        "password": password,
        "host": host,
        "port": port,
    }


def ensure_database_exists(db_params: dict) -> None:
    """Hedef veritabanı yoksa 'postgres' bakım veritabanına bağlanıp oluşturur."""
    target_db = db_params["dbname"]
    maint_params = dict(db_params)
    maint_params["dbname"] = "postgres"

    print(f"[*] PostgreSQL sunucusuna baglaniliyor ({maint_params['host']}:{maint_params['port']})...")
    conn = psycopg2.connect(**maint_params)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    try:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (target_db,))
        exists = cur.fetchone() is not None

        if not exists:
            print(f"[*] '{target_db}' veritabani bulunamadi. Olusturuluyor...")
            cur.execute(f'CREATE DATABASE "{target_db}" WITH ENCODING = \'UTF8\';')
            print(f"[OK] '{target_db}' veritabani basariyla olusturuldu.")
        else:
            print(f"[BILGI] '{target_db}' veritabani zaten mevcut.")
    finally:
        cur.close()
        conn.close()


def apply_schema(db_params: dict) -> None:
    """init_schema.sql DDL dosyasını hedef veritabanında çalıştırır."""
    target_db = db_params["dbname"]
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(f"Sema dosyasi bulunamadi: {SCHEMA_PATH}")

    print(f"[*] '{SCHEMA_PATH.name}' okunuyor...")
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    print(f"[*] '{target_db}' veritabanina sema uygulaniyor...")
    conn = psycopg2.connect(**db_params)
    cur = conn.cursor()

    try:
        cur.execute(schema_sql)
        conn.commit()
        print(f"[OK] Sema basariyla uygulandi.")

        # Doğrulama: Tabloları listele
        cur.execute("""
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        tables = [r[0] for r in cur.fetchall()]
        print(f"[OK] Olusturulan Tablolar ({len(tables)} adet): {', '.join(tables)}")

        # Doğrulama: Materialized View kontrolü
        cur.execute("""
            SELECT matviewname 
            FROM pg_matviews 
            WHERE schemaname = 'public';
        """)
        views = [r[0] for r in cur.fetchall()]
        print(f"[OK] Materialized View ({len(views)} adet): {', '.join(views)}")

    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()


def main():
    print("=" * 60)
    print("Gazi Universitesi Cocuk Alerji - SFT DB Setup")
    print("=" * 60)

    load_env()
    db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:1234@localhost:5432/sft_db")
    print(f"[*] DATABASE_URL: {db_url.split('@')[-1] if '@' in db_url else db_url}")

    db_params = parse_db_url(db_url)

    try:
        ensure_database_exists(db_params)
        apply_schema(db_params)
        print("=" * 60)
        print("[BASARILI] Veritabani ve sema hazir!")
        print("=" * 60)
    except Exception as err:
        print(f"\n[HATA] Veritabani kurulumu sirasinda hata olustu: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
