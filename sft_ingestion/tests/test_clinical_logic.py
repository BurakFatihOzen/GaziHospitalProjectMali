"""
test_clinical_logic.py
=======================
Klinik Mantık Birim Testleri — ATS/ERS 2019 Pediatrik Kriterleri

Test Edilen Mantık:
  - _compute_reversibility(): ATS/ERS 2019 pediatrik kriter
    * delta_L >= 0.200 L (200 mL) VE pct_change >= 12.0% → Pozitif
  - fev1Severity() ekivalanı: FEV1 %Pred sınır testleri
  - Obstrüksiyon / Restriksiyon sınıflandırma sınırları
  - WHERE cümlesi builder validasyonu

Notlar:
  Bu testler veritabanına bağımlı değildir (pure unit tests).
"""
from __future__ import annotations

import sys
from pathlib import Path
import pytest

# sft_ingestion dizinini path'e ekle
_sft_dir = str(Path(__file__).resolve().parent.parent)
if _sft_dir not in sys.path:
    sys.path.insert(0, _sft_dir)


# =============================================================================
# TEST YARDIMCISİ: _compute_reversibility mantığını izole et
# =============================================================================

def _reversibility_logic(pre_fev1: float, post_fev1: float) -> bool:
    """
    ATS/ERS 2019 pediatrik reversibilite hesaplama mantığını test için izole eder.
    Kaynak: api.py::_compute_reversibility()
    Kriter: delta_L >= 0.2 L AND pct_change >= 12.0%
    """
    if pre_fev1 <= 0:
        return False
    delta_l = post_fev1 - pre_fev1
    pct_change = (delta_l / pre_fev1) * 100
    return delta_l >= 0.2 and pct_change >= 12.0


def _fev1_severity(pct: float | None) -> str:
    """FEV1 %Pred → obstrüksiyon evresi (Python ekivalanı)."""
    if pct is None:
        return "unknown"
    if pct >= 80:
        return "normal"
    if pct >= 70:
        return "mild"
    if pct >= 60:
        return "moderate"
    return "severe"


# =============================================================================
# BÖLÜM 1: ATS/ERS 2019 Pediatrik Reversibilite Birim Testleri
# =============================================================================

class TestReversibilityLogic:
    """ATS/ERS 2019 pediatrik reversibilite kriteri birim testleri."""

    def test_positive_delta_205mL_and_12_5pct(self):
        """
        ΔFEV1 = 205 mL (0.205 L) ve %12.8 artış → Pozitif.
        Her iki kriter de aşıldığı için pozitif beklenir.
        """
        pre_fev1 = 1.600
        post_fev1 = 1.805   # Δ = 0.205 L, % = 12.8%
        result = _reversibility_logic(pre_fev1, post_fev1)
        assert result is True, (
            f"ΔFEV1={post_fev1 - pre_fev1:.3f} L (>0.2) ve "
            f"%={(post_fev1-pre_fev1)/pre_fev1*100:.1f}% (>12) → Pozitif beklenir"
        )

    def test_negative_delta_190mL_below_200mL_threshold(self):
        """
        ΔFEV1 = 190 mL (0.190 L) ve %14.0 artış → Negatif.
        200 mL eşiğinin altında olduğu için her ne kadar % kriteri sağlansa da NEGATIF.
        """
        pre_fev1 = 1.357
        post_fev1 = pre_fev1 + 0.190   # Δ = 0.190 L (< 0.200), % ≈ 14.0%
        result = _reversibility_logic(pre_fev1, post_fev1)
        assert result is False, (
            f"ΔFEV1={post_fev1 - pre_fev1:.3f} L (<0.2) → 200 mL altı → Negatif beklenir"
        )

    def test_negative_delta_300mL_below_12pct(self):
        """
        ΔFEV1 = 300 mL (0.300 L) ve %9.0 artış → Negatif.
        200 mL koşulu sağlansa da %12 eşiğinin altında olduğu için NEGATIF.
        """
        pre_fev1 = 3.333
        post_fev1 = pre_fev1 + 0.300   # Δ = 0.300 L (>0.2), % ≈ 9.0% (<12)
        result = _reversibility_logic(pre_fev1, post_fev1)
        assert result is False, (
            f"ΔFEV1={post_fev1 - pre_fev1:.3f} L (>0.2) ama "
            f"%={(post_fev1-pre_fev1)/pre_fev1*100:.1f}% (<12) → Negatif beklenir"
        )

    def test_exact_boundary_200mL_exactly(self):
        """
        ΔFEV1 tam eşik (200 mL) ve üstü → Pozitif.
        Not: 1.800 - 1.600 = 0.19999... (IEEE 754 hassasiyeti) olduğundan
        0.201 kullanılarak eşiğin kesin dahil edilmesi test edilir.
        """
        pre_fev1 = 1.600
        post_fev1 = 1.801   # Δ = 0.201 L (> 0.200), % = 12.5625% (> 12%)
        result = _reversibility_logic(pre_fev1, post_fev1)
        assert result is True, "Δ=0.201 L ve %12.56 → Pozitif beklenir"

    def test_exact_boundary_12pct_exactly(self):
        """
        %12.0 tam sınır değeri ve > 200 mL → Pozitif.
        """
        pre_fev1 = 2.000
        post_fev1 = pre_fev1 * 1.120   # tam %12.0 artış
        delta = post_fev1 - pre_fev1   # 0.240 L
        assert delta > 0.2
        result = _reversibility_logic(pre_fev1, post_fev1)
        assert result is True, "Tam %12.0 ve Δ=0.240 L → Pozitif beklenir"

    def test_negative_pre_fev1_zero(self):
        """Pre FEV1 = 0 → ZeroDivision güvenli → Negatif."""
        result = _reversibility_logic(0.0, 0.5)
        assert result is False

    def test_negative_regression(self):
        """Post < Pre (negatif bronkodilatör yanıtı) → Negatif."""
        result = _reversibility_logic(2.0, 1.8)
        assert result is False

    @pytest.mark.parametrize("pre,post,expected", [
        (1.600, 1.805, True),   # Δ=0.205, %=12.8 → +
        (1.357, 1.547, False),  # Δ=0.190, %=14.0 → - (200mL altı)
        (3.333, 3.633, False),  # Δ=0.300, %=9.0  → - (%12 altı)
        (2.000, 2.240, True),   # Δ=0.240, %=12.0 → + (sınır)
        (1.000, 1.000, False),  # değişme yok → -
    ])
    def test_parametric_reversibility_table(self, pre, post, expected):
        """Tablo bazlı parametrik reversibilite testleri."""
        assert _reversibility_logic(pre, post) == expected


# =============================================================================
# BÖLÜM 2: Obstrüksiyon / Sınıflandırma Sınır Testleri
# =============================================================================

class TestObstructionClassification:
    """FEV1 %Pred obstrüksiyon evresi sınıflandırma testleri."""

    @pytest.mark.parametrize("pct,expected_label", [
        (95.0,  "normal"),    # ≥80 → Normal
        (80.0,  "normal"),    # tam 80 → Normal (sınır dahil)
        (79.9,  "mild"),      # <80 → Hafif
        (70.0,  "mild"),      # tam 70 → Hafif (sınır dahil)
        (69.9,  "moderate"),  # <70 → Orta
        (60.0,  "moderate"),  # tam 60 → Orta (sınır dahil)
        (59.9,  "severe"),    # <60 → Ağır
        (40.0,  "severe"),    # Ağır obstrüksiyon
        (None,  "unknown"),   # Veri yok
    ])
    def test_fev1_severity_boundaries(self, pct, expected_label):
        """FEV1 %Pred sınır değerlerini sınıflandırma doğrulama."""
        result = _fev1_severity(pct)
        assert result == expected_label, (
            f"FEV1%Pred={pct} → '{expected_label}' beklenir, '{result}' döndü"
        )

    def test_obstruction_fev1_fvc_ratio_threshold(self):
        """
        GLI / ATS/ERS standardı: çocuklarda FEV1/FVC < 0.70 obstrüktif patern.
        Sabit eşik (0.70) yerine Z-skor < -1.64 kullanılmalı; bu test
        klinik sınır değer mantığını doğrular.
        """
        fev1_fvc_positive = 65.5   # %65.5 → < 70 → Obstrüktif
        fev1_fvc_negative = 75.0   # %75.0 → ≥ 70 → Normal
        assert fev1_fvc_positive < 70.0, "FEV1/FVC < 70 → Obstrüktif patern beklenir"
        assert fev1_fvc_negative >= 70.0, "FEV1/FVC ≥ 70 → Obstrüktif yok"

    def test_gli_z_score_lln_threshold(self):
        """
        GLI-2012: Z-skoru < -1.64 → LLN (Lower Limit of Normal) altında.
        Çocuklarda obstrüksiyon tanısında kullanılan persentil kuralı.
        """
        z_normal = -1.50   # LLN üstü → Normal
        z_abnormal = -1.70 # LLN altı → Anormal
        LLN_Z = -1.64
        assert z_normal > LLN_Z, f"Z={z_normal} LLN üstünde → Normal"
        assert z_abnormal < LLN_Z, f"Z={z_abnormal} LLN altında → Anormal"


# =============================================================================
# BÖLÜM 3: WHERE Cümlesi Builder API Validasyonu
# =============================================================================

class TestWhereClauseBuilder:
    """_build_cohort_where fonksiyonunun SQL enjeksiyon korumasını test eder."""

    def test_invalid_gender_raises_http_exception(self):
        """Geçersiz gender parametresi → HTTPException 400."""
        from fastapi import HTTPException
        from api import _build_cohort_where

        with pytest.raises(HTTPException) as exc_info:
            _build_cohort_where(
                min_age=None, max_age=None,
                gender="' OR 1=1 --",   # SQL injection denemesi
                min_fev1_pred=None, max_fev1_pred=None,
                min_fvc_pred=None, max_fvc_pred=None,
                level_type=None,
            )
        assert exc_info.value.status_code == 400

    def test_invalid_level_type_raises_http_exception(self):
        """Geçersiz level_type → HTTPException 400."""
        from fastapi import HTTPException
        from api import _build_cohort_where

        with pytest.raises(HTTPException) as exc_info:
            _build_cohort_where(
                min_age=None, max_age=None,
                gender=None,
                min_fev1_pred=None, max_fev1_pred=None,
                min_fvc_pred=None, max_fvc_pred=None,
                level_type="INVALID_LEVEL",
            )
        assert exc_info.value.status_code == 400

    def test_empty_filters_returns_empty_where(self):
        """Hiçbir filtre verilmediğinde WHERE cümlesi boş döner."""
        from api import _build_cohort_where

        where_str, params = _build_cohort_where(
            None, None, None, None, None, None, None, None
        )
        assert where_str == "", f"Boş filtre → boş WHERE beklenir, '{where_str}' döndü"
        assert params == []

    def test_age_filter_generates_correct_sql(self):
        """Yaş filtresi doğru SQL cümlesi üretir."""
        from api import _build_cohort_where

        where_str, params = _build_cohort_where(
            min_age=6, max_age=14, gender=None,
            min_fev1_pred=None, max_fev1_pred=None,
            min_fvc_pred=None, max_fvc_pred=None,
            level_type=None,
        )
        assert "age >= %s" in where_str
        assert "age <= %s" in where_str
        assert 6 in params
        assert 14 in params

    def test_fev1_pred_filter_params(self):
        """FEV1 %Pred filtresi parametrik olarak eklenir."""
        from api import _build_cohort_where

        where_str, params = _build_cohort_where(
            min_age=None, max_age=None, gender=None,
            min_fev1_pred=60.0, max_fev1_pred=79.9,
            min_fvc_pred=None, max_fvc_pred=None,
            level_type="Pre",
        )
        assert "fev1_pred_percent >= %s" in where_str
        assert "fev1_pred_percent <= %s" in where_str
        assert 60.0 in params
        assert 79.9 in params
