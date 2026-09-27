"""
test_api_endpoints.py
=====================
API Endpoint Entegrasyon Testleri

Test Edilen Endpoint'ler:
  GET  /health
  GET  /api/cohort
  GET  /api/cohort/export
  GET  /api/curves/{trial_id}
  POST /api/upload
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

import pytest

_sft_dir = str(Path(__file__).resolve().parent.parent)
if _sft_dir not in sys.path:
    sys.path.insert(0, _sft_dir)


# =============================================================================
# BÖLÜM 1: /health Endpoint Testleri
# =============================================================================


class TestHealthEndpoint:
    """/health endpoint sağlık kontrolü testleri."""

    def test_health_returns_200(self, client):
        """GET /health → 200 OK"""
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_response_has_status(self, client):
        """GET /health → {"status": "healthy"} veya benzeri JSON."""
        resp = client.get("/health")
        data = resp.json()
        assert "status" in data or "db" in data or resp.status_code == 200

    def test_health_content_type_json(self, client):
        """GET /health → Content-Type application/json."""
        resp = client.get("/health")
        assert "application/json" in resp.headers.get("content-type", "")


# =============================================================================
# BÖLÜM 2: /api/cohort Endpoint Testleri
# =============================================================================


class TestCohortEndpoint:
    """GET /api/cohort endpoint'i testleri."""

    def test_cohort_no_filters_returns_200(self, client):
        """Filtre olmadan GET /api/cohort → 200 ve sonuç listesi."""
        resp = client.get("/api/cohort")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data
        assert "results" in data
        assert isinstance(data["results"], list)

    def test_cohort_total_matches_results_length_or_pagination(self, client):
        """total alanı tutarlı sayısal değer döner."""
        resp = client.get("/api/cohort?limit=5")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data["total"], int)
        assert data["total"] >= 0
        assert len(data["results"]) <= 5

    def test_cohort_patient_fields_present(self, client):
        """Her hasta kaydı kritik alanları içeriyor."""
        resp = client.get("/api/cohort?limit=3")
        assert resp.status_code == 200
        data = resp.json()

        required_fields = [
            "patient_id",
            "external_id",
            "first_name",
            "last_name",
            "visit_id",
            "age",
            "biological_gender",
            "fev1_val",
            "fvc_val",
            "fev1_pred_percent",
        ]
        for patient in data["results"]:
            for field in required_fields:
                assert field in patient, f"'{field}' alanı hasta kaydında eksik: {list(patient.keys())}"

    def test_cohort_gender_filter_male(self, client):
        """gender=Male filtresi uygulandığında tüm sonuçlar Male."""
        resp = client.get("/api/cohort?gender=Male&limit=20")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            assert patient["biological_gender"].lower() == "male", (
                f"gender=Male filtresiyle '{patient['biological_gender']}' döndü"
            )

    def test_cohort_gender_filter_female(self, client):
        """gender=Female filtresi uygulandığında tüm sonuçlar Female."""
        resp = client.get("/api/cohort?gender=Female&limit=20")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            assert patient["biological_gender"].lower() == "female"

    def test_cohort_invalid_gender_returns_400(self, client):
        """Geçersiz gender değeri → 400 Bad Request."""
        resp = client.get("/api/cohort?gender=INVALID_GENDER")
        assert resp.status_code == 400

    def test_cohort_invalid_level_type_returns_400(self, client):
        """Geçersiz level_type değeri → 400 Bad Request."""
        resp = client.get("/api/cohort?level_type=BADLEVEL")
        assert resp.status_code == 400

    def test_cohort_fev1_pred_range_filter(self, client):
        """FEV1 %Pred aralık filtresi → sonuçlar belirlenen aralıkta."""
        resp = client.get("/api/cohort?min_fev1_pred=60&max_fev1_pred=100&limit=20")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            pct = patient.get("fev1_pred_percent")
            if pct is not None:
                assert 60.0 <= float(pct) <= 100.0, f"FEV1%Pred filtresi dışında değer: {pct}"

    def test_cohort_age_range_filter(self, client):
        """Yaş aralığı filtresi sonuçları doğru kısıtlar."""
        resp = client.get("/api/cohort?min_age=8&max_age=12&limit=20")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            age = patient.get("age")
            if age is not None:
                assert 8 <= int(age) <= 12, f"Yaş filtresi dışında değer: {age}"

    def test_cohort_post_level_type(self, client):
        """level_type=Post filtresi uygulandığında level_type='Post' kayıtlar döner."""
        resp = client.get("/api/cohort?level_type=Post&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            assert patient.get("level_type", "").lower() == "post", (
                f"level_type=Post filtresiyle '{patient.get('level_type')}' döndü"
            )

    def test_cohort_pre_level_type(self, client):
        """level_type=Pre filtresi uygulandığında level_type='Pre' kayıtlar döner."""
        resp = client.get("/api/cohort?level_type=Pre&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            assert patient.get("level_type", "").lower() == "pre"

    def test_cohort_reversibility_filter_positive(self, client):
        """reversibility_positive=true filtresi çalışıyor."""
        resp = client.get("/api/cohort?reversibility_positive=true&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            assert patient.get("reversibility_positive") is True, (
                "reversibility_positive=true filtresiyle False kayıt döndü"
            )

    def test_cohort_reversibility_filter_negative(self, client):
        """reversibility_positive=false filtresi çalışıyor."""
        resp = client.get("/api/cohort?reversibility_positive=false&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        for patient in data["results"]:
            assert patient.get("reversibility_positive") is False

    def test_cohort_pagination_offset(self, client):
        """offset parametresi farklı kayıt kümesi döndürür."""
        resp1 = client.get("/api/cohort?limit=2&offset=0")
        resp2 = client.get("/api/cohort?limit=2&offset=2")

        assert resp1.status_code == 200
        assert resp2.status_code == 200

        ids1 = [p["trial_id"] for p in resp1.json()["results"]]
        ids2 = [p["trial_id"] for p in resp2.json()["results"]]

        # Veri yeterliyse offset farklı kayıtlar döndürür
        if ids1 and ids2:
            overlap = set(ids1) & set(ids2)
            assert not overlap, "Farklı offset'ler aynı trial_id döndürdü — pagination hatası"

    def test_cohort_filters_applied_field(self, client):
        """filters_applied alanı uygulanan filtreleri yansıtıyor."""
        resp = client.get("/api/cohort?gender=Male&min_age=8")
        assert resp.status_code == 200
        data = resp.json()
        assert "filters_applied" in data
        applied = data["filters_applied"]
        assert "gender" in applied
        assert "min_age" in applied


# =============================================================================
# BÖLÜM 3: /api/cohort/export Endpoint Testleri
# =============================================================================


class TestCohortExportEndpoint:
    """GET /api/cohort/export Excel dışa aktarım testleri."""

    def test_export_returns_200(self, client):
        """GET /api/cohort/export → 200 OK."""
        resp = client.get("/api/cohort/export")
        assert resp.status_code == 200

    def test_export_content_type_xlsx(self, client):
        """Export → Content-Type OOXML XLSX."""
        resp = client.get("/api/cohort/export")
        ct = resp.headers.get("content-type", "")
        assert "spreadsheetml" in ct or "officedocument" in ct or "excel" in ct, (
            f"Excel Content-Type beklenir, '{ct}' döndü"
        )

    def test_export_content_disposition_xlsx(self, client):
        """Export → Content-Disposition .xlsx dosya adı içeriyor."""
        resp = client.get("/api/cohort/export")
        cd = resp.headers.get("content-disposition", "")
        assert ".xlsx" in cd, f"Content-Disposition .xlsx içermeli: '{cd}'"

    def test_export_file_not_empty(self, client):
        """Export dosyası boş olmayan bayt verisi döndürür."""
        resp = client.get("/api/cohort/export")
        assert len(resp.content) > 0, "Export dosyası boş"

    def test_export_file_is_valid_xlsx(self, client):
        """
        Export response gerçek XLSX bayt imzası (PK magic bytes) içeriyor.
        XLSX = ZIP başlangıcı: 0x50 0x4B 0x03 0x04
        """
        resp = client.get("/api/cohort/export")
        assert resp.content[:4] == b"PK\x03\x04", "Geçerli XLSX dosyası (ZIP magic bytes) beklenir"

    def test_export_x_record_count_header(self, client):
        """X-Record-Count header mevcut ve sayısal."""
        resp = client.get("/api/cohort/export")
        x_count = resp.headers.get("x-record-count")
        assert x_count is not None, "X-Record-Count header eksik"
        assert x_count.isdigit(), f"X-Record-Count sayısal olmalı: '{x_count}'"


# =============================================================================
# BÖLÜM 4: /api/curves/{trial_id} Endpoint Testleri
# =============================================================================


class TestCurvesEndpoint:
    """GET /api/curves/{trial_id} eğri veri endpoint testleri."""

    @pytest.fixture
    def known_trial_id(self, db_cursor, client):
        """Mevcut veritabanında REPORT eğrisi bulunan geçerli bir trial_id döner."""
        db_cursor.execute("SELECT trial_id FROM curve WHERE curve_scope = 'REPORT' LIMIT 1")
        row = db_cursor.fetchone()
        if row:
            return row[0]
        resp = client.get("/api/cohort?limit=1")
        if resp.status_code == 200 and resp.json().get("results"):
            return resp.json()["results"][0]["trial_id"]
        pytest.skip("Eğri verisi olan geçerli trial_id bulunamadı")

    def test_curves_known_trial_returns_200(self, client, known_trial_id):
        """Bilinen trial_id için GET /api/curves/{id} → 200."""
        resp = client.get(f"/api/curves/{known_trial_id}")
        assert resp.status_code == 200

    def test_curves_response_structure(self, client, known_trial_id):
        """Curve response: trial_id ve curves listesi içeriyor."""
        resp = client.get(f"/api/curves/{known_trial_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert "trial_id" in data
        assert "curves" in data
        assert isinstance(data["curves"], list)

    def test_curves_response_trial_id_matches(self, client, known_trial_id):
        """Dönen trial_id istenen trial_id ile eşleşiyor."""
        resp = client.get(f"/api/curves/{known_trial_id}")
        data = resp.json()
        assert data["trial_id"] == known_trial_id

    def test_curves_points_structure(self, client, known_trial_id):
        """Her curve, x ve y koordinatlı points listesi içeriyor."""
        resp = client.get(f"/api/curves/{known_trial_id}")
        data = resp.json()
        for curve in data["curves"]:
            assert "points" in curve, "Curve 'points' alanı içermeli"
            assert isinstance(curve["points"], list), "'points' liste olmalı"
            assert "point_count" in curve
            assert curve["point_count"] == len(curve["points"]), (
                f"point_count ({curve['point_count']}) ile points listesi uzunluğu ({len(curve['points'])}) eşleşmiyor"
            )
            for pt in curve["points"][:3]:  # İlk 3'ü kontrol et
                assert "x" in pt, "Koordinat 'x' içermeli"
                assert "y" in pt, "Koordinat 'y' içermeli"
                assert isinstance(pt["x"], (int, float))
                assert isinstance(pt["y"], (int, float))

    def test_curves_nonexistent_trial_returns_404(self, client):
        """Var olmayan trial_id → 404 Not Found."""
        resp = client.get("/api/curves/999999999")
        assert resp.status_code == 404

    def test_curves_scope_report_default(self, client, known_trial_id):
        """Varsayılan scope=REPORT sadece REPORT eğrileri döner."""
        resp = client.get(f"/api/curves/{known_trial_id}?scope=REPORT")
        assert resp.status_code == 200
        data = resp.json()
        for curve in data["curves"]:
            assert curve["curve_scope"] == "REPORT", f"scope=REPORT ile '{curve['curve_scope']}' döndü"

    def test_curves_scope_all_includes_report(self, client, known_trial_id):
        """scope=ALL tüm eğrileri döndürür."""
        resp = client.get(f"/api/curves/{known_trial_id}?scope=ALL")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["curves"]) > 0

    def test_curves_invalid_scope_returns_400(self, client, known_trial_id):
        """Geçersiz scope → 400 Bad Request."""
        resp = client.get(f"/api/curves/{known_trial_id}?scope=INVALID_SCOPE")
        assert resp.status_code == 400

    def test_curves_required_curve_fields(self, client, known_trial_id):
        """Her curve gerekli alanları içeriyor."""
        resp = client.get(f"/api/curves/{known_trial_id}")
        assert resp.status_code == 200
        data = resp.json()
        required_fields = [
            "curve_id",
            "trial_id",
            "curve_type",
            "curve_scope",
            "data_type",
            "x_unit",
            "y_unit",
            "sample_rate",
            "point_count",
            "points",
        ]
        for curve in data["curves"]:
            for field in required_fields:
                assert field in curve, f"Curve'de '{field}' alanı eksik"


# =============================================================================
# BÖLÜM 5: POST /api/upload Endpoint Testleri
# =============================================================================


class TestUploadEndpoint:
    """POST /api/upload XML yükleme endpoint testleri."""

    def test_upload_valid_xml_returns_200(self, client, sample_xml_normal):
        """Geçerli XML yükleme → 200 OK."""
        resp = client.post(
            "/api/upload",
            files=[("files", ("test.xml", io.BytesIO(sample_xml_normal), "application/xml"))],
        )
        assert resp.status_code == 200

    def test_upload_response_structure(self, client, sample_xml_normal):
        """Upload response: total_uploaded, success, skipped_duplicates, failed, results."""
        resp = client.post(
            "/api/upload",
            files=[("files", ("test.xml", io.BytesIO(sample_xml_normal), "application/xml"))],
        )
        data = resp.json()
        required_keys = ["total_uploaded", "success", "skipped_duplicates", "failed", "results"]
        for key in required_keys:
            assert key in data, f"Upload response '{key}' içermeli"

    def test_upload_result_has_status_field(self, client, sample_xml_normal):
        """Her yükleme sonucu 'status' alanı içeriyor."""
        resp = client.post(
            "/api/upload",
            files=[("files", ("test.xml", io.BytesIO(sample_xml_normal), "application/xml"))],
        )
        data = resp.json()
        assert data["results"], "results listesi boş olmamalı"
        for result in data["results"]:
            assert "status" in result
            assert result["status"] in ("SUCCESS", "SKIPPED_DUPLICATE", "FAILED_QUARANTINE"), (
                f"Bilinmeyen status: {result['status']}"
            )

    def test_upload_result_has_sha256(self, client, sample_xml_normal):
        """Upload sonucu SHA-256 hash içeriyor."""
        resp = client.post(
            "/api/upload",
            files=[("files", ("sha256_test.xml", io.BytesIO(sample_xml_normal), "application/xml"))],
        )
        data = resp.json()
        result = data["results"][0]
        assert "sha256" in result
        sha = result["sha256"]
        # SKIPPED/SUCCESS için hash mevcut olmalı
        if result["status"] != "FAILED_QUARANTINE":
            assert sha is not None and len(sha) == 64, f"SHA-256 hash geçersiz: '{sha}'"

    def test_upload_result_has_duration_ms(self, client, sample_xml_normal):
        """Upload sonucu işlem süresini (duration_ms) içeriyor."""
        resp = client.post(
            "/api/upload",
            files=[("files", ("dur_test.xml", io.BytesIO(sample_xml_normal), "application/xml"))],
        )
        data = resp.json()
        result = data["results"][0]
        assert "duration_ms" in result
        assert isinstance(result["duration_ms"], (int, float))
        assert result["duration_ms"] >= 0

    def test_upload_multiple_files_parallel(self, client, sample_xml_normal, sample_xml_obstruction):
        """Birden fazla XML aynı anda yüklenebilir."""
        resp = client.post(
            "/api/upload",
            files=[
                ("files", ("file1.xml", io.BytesIO(sample_xml_normal), "application/xml")),
                ("files", ("file2.xml", io.BytesIO(sample_xml_obstruction), "application/xml")),
            ],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_uploaded"] == 2
        assert len(data["results"]) == 2

    def test_upload_no_files_returns_422(self, client):
        """Dosya olmadan POST /api/upload → 422 Unprocessable Entity."""
        resp = client.post("/api/upload")
        assert resp.status_code == 422

    def test_upload_non_xml_extension_failed(self, client):
        """.xml olmayan dosya → FAILED_QUARANTINE."""
        resp = client.post(
            "/api/upload",
            files=[("files", ("data.csv", io.BytesIO(b"a,b,c"), "text/csv"))],
        )
        assert resp.status_code == 200
        result = resp.json()["results"][0]
        assert result["status"] == "FAILED_QUARANTINE"
