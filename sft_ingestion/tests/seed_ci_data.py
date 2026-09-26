"""
seed_ci_data.py
===============
CI/CD ortamı için başlangıç test verilerini PostgreSQL veritabanına ekler.
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/sft_test_db")


def seed():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # 1. Kaynak belgeler (idempotent ON CONFLICT DO NOTHING)
        cur.execute("""
            INSERT INTO source_document
              (original_name, file_type, sha256, parser_version, import_status)
            VALUES
              ('ci_seed_pre.xml', 'xml',
               'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
               '1.0', 'SUCCESS'),
              ('ci_seed_post.xml', 'xml',
               'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
               '1.0', 'SUCCESS')
            ON CONFLICT (sha256) DO NOTHING
            RETURNING id
        """)
        rows = cur.fetchall()
        if rows:
            doc_id = rows[0][0]
        else:
            cur.execute(
                "SELECT id FROM source_document WHERE sha256 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'"
            )
            doc_id = cur.fetchone()[0]

        # 2. Hasta
        cur.execute("""
            INSERT INTO patient (source_system, external_id, first_name, last_name, birth_date, ethnic_group)
            VALUES ('VYAIRE_LOCAL', 'CI-SEED-001', 'CI', 'Seed', '2014-01-01', 'Caucasian')
            ON CONFLICT (source_system, external_id) DO UPDATE SET first_name = EXCLUDED.first_name
            RETURNING id
        """)
        patient_id = cur.fetchone()[0]

        # 3. Ziyaret (Pre)
        cur.execute(
            """
            INSERT INTO visit (patient_id, source_doc_id, local_datetime_raw, local_datetime,
              utc_datetime, age, gender, biological_gender, height_m, weight_kg, prediction_module)
            VALUES (%s, %s, '2026-01-01T08:00:00', '2026-01-01 08:00:00',
              '2026-01-01 05:00:00+00', 10, 'Male', 'Male', 1.40, 35.0, 'GLI 2012')
            RETURNING id
        """,
            (patient_id, doc_id),
        )
        visit_id = cur.fetchone()[0]

        # 4. Level Pre
        cur.execute(
            """
            INSERT INTO measurement_level (visit_id, level_type, sequence_number)
            VALUES (%s, 'Pre', 1)
            RETURNING id
        """,
            (visit_id,),
        )
        level_id = cur.fetchone()[0]

        # 5. Measurement
        cur.execute(
            """
            INSERT INTO measurement (level_id, measurement_type, measurement_status)
            VALUES (%s, 'Spirometry', 'OK')
            RETURNING id
        """,
            (level_id,),
        )
        meas_id = cur.fetchone()[0]

        # 6. Trial (En iyi = 0)
        cur.execute(
            """
            INSERT INTO trial (measurement_id, trial_number, status, duration,
              fev1_val, fvc_val, fev1_fvc_ratio, pef_val, fev1_pred_percent, fvc_pred_percent)
            VALUES (%s, 0, 'Valid', 5.1, 2.10, 2.55, 82.4, 5.20, 88.0, 91.0)
            RETURNING id
        """,
            (meas_id,),
        )
        trial_id = cur.fetchone()[0]

        # 7. Curve
        cur.execute(
            """
            INSERT INTO curve (trial_id, curve_scope, data_type, curve_type, curve_status,
              x_unit, y_unit, x_points, y_points)
            VALUES (%s, 'REPORT', 'SpirFvc', 'TYPE_FVC_EX', 'OK',
              'ms', 'ml',
              ARRAY[0,100,200,300,400,500,600,700,800,900,1000,1100,1200,1300,1400,1500,1600,1700,1800,1900]::REAL[],
              ARRAY[0,80,280,620,1010,1390,1680,1880,2000,2080,2120,2140,2150,2150,2150,2150,2150,2150,2150,2150]::REAL[])
        """,
            (trial_id,),
        )

        # 8. MV Yenile
        cur.execute("REFRESH MATERIALIZED VIEW mv_spirometry_best_trial")
        conn.commit()
        print("CI Seed verisi basariyla eklendi!")

    except Exception as e:
        conn.rollback()
        print(f"Seed hatasi: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    seed()
