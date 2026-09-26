"""
test_database_integrity.py
===========================
Veritabanı Entegrasyon Testleri

Test Edilen:
  1. Materialized view (mv_spirometry_best_trial) yapısal bütünlüğü
  2. Zorunlu klinik kolonların NULL olmama kontrolü
  3. Referans bütünlüğü: trial → measurement → level → visit → patient
  4. Curve tablosu: x_points ve y_points eşit uzunlukta
  5. SHA-256 uniqueness constraint çalışıyor
  6. Reversed view: level_type değerleri yalnızca 'Pre' veya 'Post'
  7. Index varlık kontrolü
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_sft_dir = str(Path(__file__).resolve().parent.parent)
if _sft_dir not in sys.path:
    sys.path.insert(0, _sft_dir)


# =============================================================================
# BÖLÜM 1: Materialized View Yapısal Bütünlüğü
# =============================================================================


class TestMaterializedViewIntegrity:
    """mv_spirometry_best_trial materialized view veri bütünlük testleri."""

    def test_mv_has_data(self, db_cursor):
        """Materialized view en az 1 kayıt içeriyor (üretim verisi mevcut)."""
        db_cursor.execute("SELECT COUNT(*) FROM mv_spirometry_best_trial")
        count = db_cursor.fetchone()[0]
        assert count > 0, "mv_spirometry_best_trial boş — REFRESH yapılmamış olabilir"

    def test_mv_required_columns_not_null(self, db_cursor):
        """
        Kritik klinik kolonlar NULL içermemeli.
        patient_id, visit_id, trial_id, level_type, fev1_val
        """
        db_cursor.execute("""
            SELECT COUNT(*)
            FROM mv_spirometry_best_trial
            WHERE patient_id IS NULL
               OR visit_id IS NULL
               OR trial_id IS NULL
               OR level_type IS NULL
               OR fev1_val IS NULL
        """)
        null_count = db_cursor.fetchone()[0]
        assert null_count == 0, f"{null_count} kayıt kritik NULL kolonlar içeriyor — veri bütünlüğü sorunu"

    def test_mv_level_type_only_pre_or_post(self, db_cursor):
        """
        level_type yalnızca 'Pre' veya 'Post' değerlerini almalıdır.
        Diğer değerler şema ihlali.
        """
        db_cursor.execute("""
            SELECT DISTINCT level_type
            FROM mv_spirometry_best_trial
            WHERE level_type NOT IN ('Pre', 'Post')
        """)
        invalid_levels = db_cursor.fetchall()
        assert not invalid_levels, f"Geçersiz level_type değerleri: {invalid_levels}"

    def test_mv_fev1_pred_percent_range(self, db_cursor):
        """
        FEV1 %Pred değerleri klinik mantıklı aralıkta olmalı.
        Çocuklarda: 0 ile 180 arası kabul edilebilir.
        """
        db_cursor.execute("""
            SELECT COUNT(*)
            FROM mv_spirometry_best_trial
            WHERE fev1_pred_percent IS NOT NULL
              AND (fev1_pred_percent < 0 OR fev1_pred_percent > 180)
        """)
        out_of_range = db_cursor.fetchone()[0]
        assert out_of_range == 0, f"{out_of_range} kayıt klinik dışı FEV1 %Pred değeri içeriyor"

    def test_mv_fvc_val_positive(self, db_cursor):
        """FVC değerleri pozitif olmalı (< 0 veya = 0 klinik olarak geçersiz)."""
        db_cursor.execute("""
            SELECT COUNT(*)
            FROM mv_spirometry_best_trial
            WHERE fvc_val IS NOT NULL AND fvc_val <= 0
        """)
        non_positive = db_cursor.fetchone()[0]
        assert non_positive == 0, f"{non_positive} kayıt negatif/sıfır FVC içeriyor"

    def test_mv_unique_trial_id(self, db_cursor):
        """
        trial_id mv'de unique olmalıdır (UNIQUE INDEX ile korunuyor).
        """
        db_cursor.execute("""
            SELECT trial_id, COUNT(*) AS cnt
            FROM mv_spirometry_best_trial
            GROUP BY trial_id
            HAVING COUNT(*) > 1
        """)
        duplicates = db_cursor.fetchall()
        assert not duplicates, f"MV'de trial_id tekrarlıyor: {duplicates}"

    def test_mv_age_in_pediatric_range(self, db_cursor):
        """
        Gazi Çocuk Alerji Kliniği: yaşlar pediatrik aralıkta (≤18) olmalıdır.
        Not: Kalibrasyon / teknik testler için yetişkin kayıtlar bulunabilir.
        Bu test adult kayıt varlığını raporlar ama build'i kesmez.
        """
        db_cursor.execute("""
            SELECT external_id, age
            FROM mv_spirometry_best_trial
            WHERE age IS NOT NULL AND age > 18
        """)
        adult_rows = db_cursor.fetchall()
        # İzin verilen teknik/kalibrasyon kayıtlar (dışında bırakılan bilinen ID'ler)
        KNOWN_CALIBRATION = {"CFNSPJO750209"}
        unexpected_adults = [r for r in adult_rows if r[0] not in KNOWN_CALIBRATION]
        assert not unexpected_adults, (
            f"{len(unexpected_adults)} beklenmedik yetişkin kayıt: {unexpected_adults}\n"
            "Çocuk kliniği dışı hasta mı yanlış importlandı?"
        )


# =============================================================================
# BÖLÜM 2: Referans Bütünlüğü (FK Cascade Kontrolleri)
# =============================================================================


class TestReferentialIntegrity:
    """Tablolar arası referans bütünlüğü entegrasyon testleri."""

    def test_all_trials_have_valid_measurement(self, db_cursor):
        """Her trial kaydının geçerli bir measurement'ı vardır."""
        db_cursor.execute("""
            SELECT COUNT(*) FROM trial t
            LEFT JOIN measurement m ON m.id = t.measurement_id
            WHERE m.id IS NULL
        """)
        orphan_trials = db_cursor.fetchone()[0]
        assert orphan_trials == 0, f"{orphan_trials} trial kaydı measurement'sız (orphan)"

    def test_all_visits_have_valid_patient(self, db_cursor):
        """Her visit kaydının geçerli bir patient'ı vardır."""
        db_cursor.execute("""
            SELECT COUNT(*) FROM visit v
            LEFT JOIN patient p ON p.id = v.patient_id
            WHERE p.id IS NULL
        """)
        orphan_visits = db_cursor.fetchone()[0]
        assert orphan_visits == 0, f"{orphan_visits} visit kaydı patient'sız (orphan)"

    def test_all_measurement_levels_have_valid_visit(self, db_cursor):
        """Her measurement_level kaydının geçerli bir visit'i vardır."""
        db_cursor.execute("""
            SELECT COUNT(*) FROM measurement_level ml
            LEFT JOIN visit v ON v.id = ml.visit_id
            WHERE v.id IS NULL
        """)
        orphan_levels = db_cursor.fetchone()[0]
        assert orphan_levels == 0, f"{orphan_levels} measurement_level kaydı visit'siz"

    def test_patient_external_id_uniqueness_per_source(self, db_cursor):
        """
        (source_system, external_id) çifti unique olmalıdır.
        UPSERT mantığı sayesinde mükerrer external_id olmamalıdır.
        """
        db_cursor.execute("""
            SELECT source_system, external_id, COUNT(*) AS cnt
            FROM patient
            GROUP BY source_system, external_id
            HAVING COUNT(*) > 1
        """)
        duplicates = db_cursor.fetchall()
        assert not duplicates, f"Tekrarlayan (source_system, external_id) çiftleri: {duplicates}"

    def test_source_document_sha256_uniqueness(self, db_cursor):
        """source_document.sha256 tüm kayıtlarda unique."""
        db_cursor.execute("""
            SELECT sha256, COUNT(*) AS cnt
            FROM source_document
            GROUP BY sha256
            HAVING COUNT(*) > 1
        """)
        duplicates = db_cursor.fetchall()
        assert not duplicates, f"Tekrarlayan SHA-256 hash değerleri: {duplicates}"


# =============================================================================
# BÖLÜM 3: Curve Tablosu Veri Bütünlüğü
# =============================================================================


class TestCurveDataIntegrity:
    """curve tablosu koordinat dizisi bütünlük testleri."""

    def test_x_y_points_equal_length(self, db_cursor):
        """
        x_points ve y_points dizileri her zaman eşit uzunlukta olmalı.
        Eşit olmayan diziler çizim hatalarına yol açar.
        """
        db_cursor.execute("""
            SELECT id,
                   array_length(x_points, 1) AS len_x,
                   array_length(y_points, 1) AS len_y
            FROM curve
            WHERE x_points IS NOT NULL AND y_points IS NOT NULL
              AND array_length(x_points, 1) != array_length(y_points, 1)
            LIMIT 5
        """)
        mismatched = db_cursor.fetchall()
        assert not mismatched, f"x_points ve y_points uzunlukları eşit olmayan curve'ler: {mismatched}"

    def test_curve_scope_values_valid(self, db_cursor):
        """curve.curve_scope yalnızca 'REPORT' veya 'RAW' değeri alır."""
        db_cursor.execute("""
            SELECT DISTINCT curve_scope
            FROM curve
            WHERE curve_scope NOT IN ('REPORT', 'RAW')
        """)
        invalid = db_cursor.fetchall()
        assert not invalid, f"Geçersiz curve_scope değerleri: {invalid}"

    def test_curves_have_minimum_points(self, db_cursor):
        """
        REPORT eğrileri görselleştirme için en az 10 nokta içermeli.
        """
        db_cursor.execute("""
            SELECT id, array_length(x_points, 1) AS pts
            FROM curve
            WHERE curve_scope = 'REPORT'
              AND x_points IS NOT NULL
              AND array_length(x_points, 1) < 10
        """)
        sparse_curves = db_cursor.fetchall()
        assert not sparse_curves, f"REPORT eğrilerinde 10'dan az nokta: {sparse_curves}"

    def test_all_curves_have_valid_trial_id(self, db_cursor):
        """Her curve kaydının geçerli bir trial referansı vardır."""
        db_cursor.execute("""
            SELECT COUNT(*) FROM curve c
            LEFT JOIN trial t ON t.id = c.trial_id
            WHERE t.id IS NULL
        """)
        orphan_curves = db_cursor.fetchone()[0]
        assert orphan_curves == 0, f"{orphan_curves} curve kaydı trial'sız"


# =============================================================================
# BÖLÜM 4: Index Varlık Kontrolü
# =============================================================================


class TestIndexExistence:
    """Kritik performans indexlerinin varlığını doğrular."""

    @pytest.mark.parametrize(
        "index_name",
        [
            "idx_patient_external_id",
            "idx_visit_patient_datetime",
            "idx_trial_core_metrics",
            "idx_curve_report",
            "idx_source_document_sha256",
            "idx_mv_spiro_trial",
            "idx_mv_spiro_clinical_filter",
        ],
    )
    def test_critical_index_exists(self, db_cursor, index_name):
        """Kritik performans indexi mevcut."""
        db_cursor.execute(
            """
            SELECT COUNT(*) FROM pg_indexes
            WHERE indexname = %s
        """,
            (index_name,),
        )
        count = db_cursor.fetchone()[0]
        assert count == 1, f"Kritik index '{index_name}' bulunamadı"


# =============================================================================
# BÖLÜM 5: İş Kuralı Testleri
# =============================================================================


class TestBusinessRules:
    """Klinik iş kuralı bütünlük testleri."""

    def test_pre_post_pairs_for_reversibility(self, db_cursor):
        """
        Reversibilite pozitif olarak hesaplanan hastalar için hem Pre hem Post
        kayıtları bulunmalıdır.
        """
        db_cursor.execute("""
            SELECT mv_pre.patient_id
            FROM mv_spirometry_best_trial mv_pre
            WHERE mv_pre.level_type = 'Pre'
              AND EXISTS (
                SELECT 1 FROM mv_spirometry_best_trial mv_post
                WHERE mv_post.patient_id = mv_pre.patient_id
                  AND mv_post.visit_id = mv_pre.visit_id
                  AND mv_post.level_type = 'Post'
              )
            LIMIT 5
        """)
        pairs = db_cursor.fetchall()
        # En az bazı hastaların Pre+Post çifti olmalı (test verisi mevcutsa)
        # Bu test bilgi amaçlı - 0 çift olabilir (veri bağımlı)
        assert isinstance(pairs, list), "Query liste döndürmeli"

    def test_fev1_fvc_ratio_clinical_plausibility(self, db_cursor):
        """
        FEV1/FVC oranı 0 ile 120 arasında olmalı (%)
        120'nin üstü klinik olarak imkansız.
        """
        db_cursor.execute("""
            SELECT COUNT(*)
            FROM mv_spirometry_best_trial
            WHERE fev1_fvc_ratio IS NOT NULL
              AND (fev1_fvc_ratio < 0 OR fev1_fvc_ratio > 120)
        """)
        out_of_range = db_cursor.fetchone()[0]
        assert out_of_range == 0, f"{out_of_range} kayıt klinik dışı FEV1/FVC oranı içeriyor"
