"""
mock_data_generator.py
======================
Gazi Üniversitesi Çocuk Alerji Kliniği — SFT MVP Ingestion Katmanı
Vyaire NIOSH_XmlExport.V3.0 formatında gerçekçi sentetik XML üretici.

Amaç:
  - İngesion parser'ını ve veritabanı şemasını gerçek cihaz olmadan test etmek
  - Hem Pre hem Post (bronkodilatör) seviyeleri içeren eksiksiz test senaryoları oluşturmak
  - GLI-2012 uyumlu % predicted ve Z-skoru alanları içermek

Kullanım:
  python mock_data_generator.py --output-dir ./mock_xmls --count 5

Bağımlılıklar: Yalnızca standart kütüphane (xml.etree, random, argparse, pathlib)
"""

import argparse
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.dom import minidom
from xml.etree import ElementTree as ET

# ---------------------------------------------------------------------------
# SABIT PARAMETRE KÜTÜPHANESİ — Vyaire ParameterId'leri
# ---------------------------------------------------------------------------
PARAM_REGISTRY: list[dict] = [
    {"id": 65537, "short": "VC IN ", "long": "VC IN", "unit": "ISO_LITER", "unit_text": "Liter", "pred_ref": None},
    {"id": 65544, "short": "VC EX ", "long": "VC EX", "unit": "ISO_LITER", "unit_text": "Liter", "pred_ref": None},
    {"id": 65545, "short": "VC MAX", "long": "VC MAX", "unit": "ISO_LITER", "unit_text": "Liter", "pred_ref": 219},
    {"id": 65547, "short": "FEV1 ", "long": "FEV 1", "unit": "ISO_LITER", "unit_text": "Liter", "pred_ref": 44},
    {
        "id": 65548,
        "short": "FEV1%P",
        "long": "FEV 1 % Pred",
        "unit": "ISO_PER_CENT",
        "unit_text": "%",
        "pred_ref": None,
    },
    {"id": 65551, "short": "FEV1%F", "long": "FEV 1 % FVC", "unit": "ISO_PER_CENT", "unit_text": "%", "pred_ref": 48},
    {"id": 65567, "short": "FVC   ", "long": "FVC", "unit": "ISO_LITER", "unit_text": "Liter", "pred_ref": 42},
    {"id": 65568, "short": "FVC%P ", "long": "FVC % Pred", "unit": "ISO_PER_CENT", "unit_text": "%", "pred_ref": None},
    {"id": 65569, "short": "FET   ", "long": "FET", "unit": "ISO_S", "unit_text": "sec", "pred_ref": None},
    {"id": 65573, "short": "PEF   ", "long": "PEF", "unit": "LITER_PER_SECOND", "unit_text": "L/s", "pred_ref": 33},
    {"id": 65625, "short": "FEV6  ", "long": "FEV 6", "unit": "ISO_LITER", "unit_text": "Liter", "pred_ref": 202},
    {
        "id": 65626,
        "short": "FEV1%6",
        "long": "FEV 1 % FEV 6",
        "unit": "ISO_PER_CENT",
        "unit_text": "%",
        "pred_ref": 203,
    },
    {
        "id": 65640,
        "short": "MFEF  ",
        "long": "MFEF 75/25",
        "unit": "LITER_PER_SECOND",
        "unit_text": "L/s",
        "pred_ref": 29,
    },
    {
        "id": 65669,
        "short": "FEF1s ",
        "long": "Forced expiratory flow after 1 second",
        "unit": "LITER_PER_SECOND",
        "unit_text": "L/s",
        "pred_ref": None,
    },
]

# Pediatrik yaş/boy/kilo aralıkları (çocuk alerji kliniği profili)
PATIENT_PROFILES: list[dict] = [
    {
        "ext_id": "GU2024001",
        "first": "Zeynep",
        "last": "Kaya",
        "birth_offset_years": 9,  # 9 yaş
        "gender": "Female",
        "height_m": 1.33,
        "weight_kg": 28.5,
        "ethnic": "Caucasian",
        "scenario": "mild_obstruction",  # FEV1 ~%72
    },
    {
        "ext_id": "GU2024002",
        "first": "Ahmet",
        "last": "Demir",
        "birth_offset_years": 12,
        "gender": "Male",
        "height_m": 1.52,
        "weight_kg": 43.0,
        "ethnic": "Caucasian",
        "scenario": "normal",  # FEV1 ~%98
    },
    {
        "ext_id": "GU2024003",
        "first": "Elif",
        "last": "Yıldız",
        "birth_offset_years": 7,
        "gender": "Female",
        "height_m": 1.22,
        "weight_kg": 22.0,
        "ethnic": "Caucasian",
        "scenario": "severe_obstruction",  # FEV1 ~%55, reversibilite pozitif
    },
    {
        "ext_id": "GU2024004",
        "first": "Mert",
        "last": "Çelik",
        "birth_offset_years": 14,
        "gender": "Male",
        "height_m": 1.68,
        "weight_kg": 58.0,
        "ethnic": "Caucasian",
        "scenario": "borderline",  # FEV1 ~%80
    },
    {
        "ext_id": "GU2024005",
        "first": "Sude",
        "last": "Arslan",
        "birth_offset_years": 11,
        "gender": "Female",
        "height_m": 1.44,
        "weight_kg": 36.0,
        "ethnic": "Caucasian",
        "scenario": "small_airway",  # MFEF düşük, FEV1 normal
    },
]


# ---------------------------------------------------------------------------
# SENARYO TABANLI PARAMETRE ÜRETICI
# ---------------------------------------------------------------------------
def _build_scenario_params(
    scenario: str,
    is_post: bool,
    height_m: float,
    age: int,
) -> dict[str, float]:
    """
    Klinik senaryoya göre gerçekçi spirometri değerleri üretir.
    FVC ve FEV1 için GLI-2012 yaklaşık beklenen değer kullanılır.

    Returns:
        dict of short_name -> measured_value
    """
    # Çok basitleştirilmiş GLI-2012 yaklaşımı (cinsiyet Caucasian Female için)
    # Gerçek implementasyonda gli-calculator kütüphanesi kullanılacak
    fvc_pred = 0.0395 * (height_m * 100) - 2.60 + (age - 8) * 0.095
    fvc_pred = max(fvc_pred, 0.8)

    multipliers: dict[str, dict[str, float]] = {
        "normal": {"fev1_pct": 0.98, "fvc_pct": 1.00, "ratio": 83.5},
        "mild_obstruction": {"fev1_pct": 0.72, "fvc_pct": 0.90, "ratio": 72.0},
        "severe_obstruction": {"fev1_pct": 0.55, "fvc_pct": 0.75, "ratio": 58.0},
        "borderline": {"fev1_pct": 0.80, "fvc_pct": 0.95, "ratio": 78.0},
        "small_airway": {"fev1_pct": 0.88, "fvc_pct": 0.97, "ratio": 80.0},
    }
    m = multipliers.get(scenario, multipliers["normal"])

    # Post-bronkodilatör: severe_obstruction için reversibilite simülasyonu
    post_boost = 0.0
    if is_post and scenario == "severe_obstruction":
        post_boost = 0.15  # +15% FEV1 artışı (reversibilite pozitif)
    elif is_post:
        post_boost = random.uniform(0.02, 0.05)

    fev1_pct = min(m["fev1_pct"] + post_boost, 1.15)

    fvc = round(fvc_pred * m["fvc_pct"] + random.uniform(-0.05, 0.05), 3)
    fev1 = round(fvc_pred * fev1_pct + random.uniform(-0.03, 0.03), 4)
    ratio = round((fev1 / fvc) * 100 + random.uniform(-0.5, 0.5), 3)
    pef = round(fvc * 2.2 + random.uniform(-0.2, 0.2), 3)
    fev6 = round(fvc * 0.998 + random.uniform(-0.01, 0.01), 4)
    mfef = round(fvc * 0.85 * m["fvc_pct"] + random.uniform(-0.1, 0.1), 4)
    vc_in = round(fvc * 1.01, 3)
    vc_ex = round(fvc * 0.999, 3)
    vc_max = round(max(vc_in, vc_ex), 3)
    fet = round(random.uniform(6.0, 9.0), 4)
    fef1s = round(fvc * 0.15 + random.uniform(-0.05, 0.05), 3)

    # % predicted değerleri (FEV1 ve FVC için)
    fev1_pred_pct = round(fev1_pct * 100, 2)
    fvc_pred_pct = round(m["fvc_pct"] * 100, 2)

    return {
        "VC IN ": vc_in,
        "VC EX ": vc_ex,
        "VC MAX": vc_max,
        "FEV1 ": fev1,
        "FEV1%P": fev1_pred_pct,
        "FEV1%F": ratio,
        "FVC   ": fvc,
        "FVC%P ": fvc_pred_pct,
        "FET   ": fet,
        "PEF   ": pef,
        "FEV6  ": fev6,
        "FEV1%6": round((fev1 / fev6) * 100, 4),
        "MFEF  ": mfef,
        "FEF1s ": fef1s,
        # Özel alanlara açık erişim için
        "_fev1_pred_pct": fev1_pred_pct,
        "_fvc_pred_pct": fvc_pred_pct,
    }


# ---------------------------------------------------------------------------
# AKI-HACİM EĞRİSİ SİMÜLATÖRÜ
# ---------------------------------------------------------------------------
def _generate_fvc_ex_curve(
    fvc_liters: float,
    pef_l_s: float,
    n_points: int = 120,
) -> tuple[list[float], list[float]]:
    """
    TYPE_FVC_EX (Zorlu Ekspirasyon Akış-Hacim) eğrisi koordinatları üretir.
    Birim: X = ml (40 ml adım), Y = ml/s
    """
    xs: list[float] = []
    ys: list[float] = []

    fvc_ml = fvc_liters * 1000
    pef_ml_s = pef_l_s * 1000
    step_ml = 40.0

    for i in range(n_points + 1):
        x = i * step_ml
        if x > fvc_ml:
            break
        t = x / fvc_ml  # normalized 0..1

        # PEF'e hızlı tırmanma, sonra üstel düşüş
        if t < 0.08:
            y = pef_ml_s * (t / 0.08)
        else:
            # Üstel çürüme: y = PEF * exp(-k * (t - 0.08))
            k = 2.8 + random.uniform(-0.2, 0.2)
            y = pef_ml_s * math.exp(-k * (t - 0.08))

        # Gürültü
        y += random.uniform(-pef_ml_s * 0.015, pef_ml_s * 0.015)
        y = max(0.0, y)

        xs.append(round(x, 1))
        ys.append(round(y, 1))

    return xs, ys


def _generate_fvc_in_curve(
    fvc_liters: float,
    n_points: int = 120,
) -> tuple[list[float], list[float]]:
    """
    TYPE_FVC_IN (Zorlu İnspirasyon) eğrisi koordinatları üretir.
    Y değerleri negatiftir (inspirasyon yönü).
    """
    xs: list[float] = []
    ys: list[float] = []

    fvc_ml = fvc_liters * 1000
    peak_flow_ml_s = fvc_ml * 1.55 + random.uniform(-200, 200)
    step_ml = 40.0

    for i in range(int(fvc_ml / step_ml) + 2):
        x = i * step_ml
        if x > fvc_ml + step_ml:
            break
        t = x / fvc_ml

        if t < 0.15:
            y = -peak_flow_ml_s * (t / 0.15)
        elif t < 0.75:
            y = -peak_flow_ml_s * (1.0 - 0.25 * (t - 0.15))
        else:
            y = -peak_flow_ml_s * 0.85 * (1.0 - (t - 0.75) / 0.3)

        y += random.uniform(-peak_flow_ml_s * 0.01, peak_flow_ml_s * 0.01)
        y = min(0.0, y)

        xs.append(round(x, 1))
        ys.append(round(y, 1))

    return xs, ys


def _curve_data_str(xs: list[float], ys: list[float]) -> str:
    """Koordinat çiftlerini Vyaire 'x,y x,y ...' formatına dönüştürür."""
    return " ".join(f"{int(x)},{int(y)}" for x, y in zip(xs, ys))


# ---------------------------------------------------------------------------
# XML OLUŞTURUCU
# ---------------------------------------------------------------------------
def _add_parameter(
    parent: ET.Element,
    param_id: int,
    short_name: str,
    long_name: str,
    value: float,
    store_unit: str,
    unit_text: str,
    pred_ref: int | None = None,
) -> None:
    """trial/Parameters altına bir <Parameter> elemanı ekler."""
    p = ET.SubElement(parent, "Parameter", ParameterId=str(param_id), ShortName=short_name)
    ET.SubElement(p, "LongName").text = long_name
    if pred_ref is not None:
        ET.SubElement(p, "PredictedReference").text = str(pred_ref)
    ET.SubElement(p, "Value").text = str(value)

    unit_el = ET.SubElement(p, "Unit")
    su = ET.SubElement(unit_el, "StoreUnit", Name=store_unit)
    ET.SubElement(su, "LongText").text = unit_text
    du = ET.SubElement(unit_el, "DisplayUnit", Name=store_unit)
    ET.SubElement(du, "LongText").text = unit_text
    ET.SubElement(unit_el, "StoreToDisplayFactor").text = "1"


def _add_curve(
    curves_el: ET.Element,
    curve_type: str,
    data_type: str,
    xs: list[float],
    ys: list[float],
    x_res: str,
    y_res: str,
    sample_rate: str = "40 ml",
) -> None:
    """<Curves> altına bir <Curve> elemanı ekler."""
    min_x = min(xs) if xs else 0
    max_x = max(xs) if xs else 0
    min_y = min(abs(y) for y in ys) if ys else 0
    max_y = max(abs(y) for y in ys) if ys else 0

    attrs: dict[str, str] = {
        "DataType": data_type,
        "Status": "Valid",
        "SampleRate": sample_rate,
    }
    if curve_type:
        attrs["Type"] = curve_type

    curve_el = ET.SubElement(curves_el, "Curve", **attrs)
    ET.SubElement(curve_el, "Data").text = _curve_data_str(xs, ys)
    ET.SubElement(curve_el, "XResolution").text = x_res
    ET.SubElement(curve_el, "YResolution").text = y_res
    ET.SubElement(curve_el, "MinX").text = str(int(min_x))
    ET.SubElement(curve_el, "MaxX").text = str(int(max_x))
    ET.SubElement(curve_el, "MinY").text = "0"
    ET.SubElement(curve_el, "MaxY").text = str(int(max_y))


def _build_trial_element(
    trials_el: ET.Element,
    trial_number: int,
    scenario: str,
    is_post: bool,
    height_m: float,
    age: int,
) -> None:
    """Tek bir <Trial> elemanı oluşturur (parametreler + eğriler)."""
    params = _build_scenario_params(scenario, is_post, height_m, age)
    fvc = params["FVC   "]
    pef = params["PEF   "]

    trial_el = ET.SubElement(trials_el, "Trial", Number=str(trial_number))
    ET.SubElement(trial_el, "Status").text = "None" if trial_number == 0 else "Valid"
    ET.SubElement(trial_el, "Duration").text = str(round(random.uniform(28, 38), 1))

    # --- Parametreler ---
    params_el = ET.SubElement(trial_el, "Parameters")
    for preg in PARAM_REGISTRY:
        short = preg["short"]
        val = params.get(short)
        if val is None:
            continue
        _add_parameter(
            parent=params_el,
            param_id=preg["id"],
            short_name=short,
            long_name=preg["long"],
            value=val,
            store_unit=preg["unit"],
            unit_text=preg["unit_text"],
            pred_ref=preg["pred_ref"],
        )

    # --- ReportCurveData Eğrileri ---
    report_curves_el = ET.SubElement(ET.SubElement(trial_el, "ReportCurveData"), "Curves")

    xs_ex, ys_ex = _generate_fvc_ex_curve(fvc, pef, n_points=118)
    _add_curve(report_curves_el, "TYPE_FVC_EX", "SpirFvc", xs_ex, ys_ex, "ml", "ml/s", "40 ml")

    xs_in, ys_in = _generate_fvc_in_curve(fvc, n_points=118)
    _add_curve(report_curves_el, "TYPE_FVC_IN", "SpirFvc", xs_in, ys_in, "ml", "ml/s", "40 ml")


def build_patient_xml(profile: dict, visit_date: datetime) -> ET.Element:
    """
    Vyaire NIOSH_XmlExport.V3.0 formatında tam bir hasta XML ağacı oluşturur.
    Pre ve Post (bronkodilatör) seviyeleri ile 2 deneme içerir.
    """
    root = ET.Element(
        "PatientTree",
        xmlns_xsi="http://www.w3.org/2001/XMLSchema-instance",
        xmlns_xsd="http://www.w3.org/2001/XMLSchema",
        Version="NIOSH_XmlExport.V3.0",
    )
    # Çift isimli xmlns attribute'ları ET'de doğrudan desteklenmez, manuel set
    root.set("xmlns:xsi", "http://www.w3.org/2001/XMLSchema-instance")
    root.set("xmlns:xsd", "http://www.w3.org/2001/XMLSchema")

    # Hasta bilgileri
    patient_el = ET.SubElement(root, "Patient")
    ET.SubElement(patient_el, "ExternalId").text = profile["ext_id"]
    ET.SubElement(patient_el, "LastName").text = profile["last"]
    ET.SubElement(patient_el, "FirstName").text = profile["first"]

    birth_dt = visit_date - timedelta(days=365 * profile["birth_offset_years"] + 180)
    ET.SubElement(patient_el, "Birthdate").text = birth_dt.strftime("%Y-%m-%dT00:00:00Z")

    race = ET.SubElement(patient_el, "RaceInformation", EthnicGroupId="1", Name=profile["ethnic"])
    ET.SubElement(race, "EthnicGroup").text = profile["ethnic"]

    # Ziyaret ağacı
    visit_trees = ET.SubElement(root, "VisitTrees")
    visit_tree = ET.SubElement(visit_trees, "VisitTree")

    local_date_str = visit_date.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    utc_date_str = (visit_date - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    visit_el = ET.SubElement(visit_tree, "Visit", LocalDate=local_date_str)
    ET.SubElement(visit_el, "Age").text = str(profile["birth_offset_years"])
    ET.SubElement(visit_el, "Gender").text = profile["gender"]
    ET.SubElement(visit_el, "BiologicalGender").text = profile["gender"]
    ET.SubElement(visit_el, "ReviewStatus").text = "4"
    ET.SubElement(visit_el, "Height").text = str(profile["height_m"])
    ET.SubElement(visit_el, "Weight").text = str(profile["weight_kg"])
    ET.SubElement(visit_el, "PredModuleName").text = "GLI 2012"
    ET.SubElement(visit_el, "UtcDate").text = utc_date_str

    operator = ET.SubElement(visit_el, "Operator")
    ET.SubElement(operator, "Name").text = "Lab Teknisyeni"

    physician = ET.SubElement(visit_el, "Physician")
    ET.SubElement(physician, "Name").text = "Çocuk Alerji"
    ET.SubElement(physician, "FirstName").text = "Uzm. Dr."

    levels_el = ET.SubElement(visit_tree, "Levels")

    # PRE seviyesi
    for level_cfg in [
        {"type": "Pre", "seq": 1, "is_post": False},
        {"type": "Post", "seq": 2, "is_post": True},
    ]:
        level_tree = ET.SubElement(levels_el, "LevelTree")
        ET.SubElement(
            level_tree, "Level", Type=level_cfg["type"], Sequence=str(level_cfg["seq"]), PatientPosition="Sitting"
        )

        measurements_el = ET.SubElement(level_tree, "Measurements")
        meas_el = ET.SubElement(measurements_el, "Measurement", MeasurementType="Spirometry", Status="None")
        ET.SubElement(meas_el, "Duration").text = str(round(random.uniform(90, 120), 0))
        ET.SubElement(meas_el, "SoftwareVersionOriginal").text = "SentrySuite 3.3"
        ET.SubElement(meas_el, "SoftwareVersionActual").text = "SentrySuite 3.3"
        meas_local = visit_date + timedelta(minutes=level_cfg["seq"] * 5)
        ET.SubElement(meas_el, "LocalDate").text = meas_local.strftime("%Y-%m-%dT%H:%M:%S.000Z")

        methods = ET.SubElement(meas_el, "ConductedMethodIds")
        ET.SubElement(methods, "string").text = "Spirometry_FVC"

        ws_el = ET.SubElement(ET.SubElement(meas_el, "Workstation"), "Name")
        ws_el.text = "00000000-0000-0000-0000-000000000001"

        trials_el = ET.SubElement(meas_el, "Trials")

        # Trial 0 = Best, Trial 1 ve 2 = bireysel denemeler
        for tn in [0, 1, 2]:
            _build_trial_element(
                trials_el,
                tn,
                profile["scenario"],
                level_cfg["is_post"],
                profile["height_m"],
                profile["birth_offset_years"],
            )

    return root


def prettify_xml(element: ET.Element) -> str:
    """ElementTree'yi girintili, UTF-8 XML stringine dönüştürür."""
    raw = ET.tostring(element, encoding="unicode", xml_declaration=False)
    # minidom ile güzel biçimlendirme
    parsed = minidom.parseString(f'<?xml version="1.0" encoding="utf-8"?>{raw}')
    pretty = parsed.toprettyxml(indent="  ", encoding=None)
    # toprettyxml başına otomatik XML declaration ekler; ikincisini kaldır
    lines = pretty.split("\n")
    if lines[0].startswith("<?xml"):
        lines = lines[1:]
    return '<?xml version="1.0" encoding="utf-8"?>\n' + "\n".join(lines)


# ---------------------------------------------------------------------------
# ANA ÇALIŞMA FONKSİYONU
# ---------------------------------------------------------------------------
def generate_mock_xmls(output_dir: Path, count: int, seed: int = 42) -> None:
    """
    Belirtilen dizine `count` adet sentetik Vyaire XML dosyası yazar.
    Zaman damgaları gerçekçi klinik dağılımda üretilir (son 12 ay).
    """
    random.seed(seed)
    output_dir.mkdir(parents=True, exist_ok=True)

    profiles = PATIENT_PROFILES[:count]
    base_date = datetime(2026, 9, 1, 9, 0, 0, tzinfo=timezone.utc)

    for i, profile in enumerate(profiles):
        # Son 12 ay içinde rastgele ziyaret tarihi
        days_offset = random.randint(0, 365)
        visit_dt = base_date - timedelta(days=days_offset, hours=random.randint(0, 6))

        root_el = build_patient_xml(profile, visit_dt)
        xml_str = prettify_xml(root_el)

        filename = f"{profile['ext_id']}.xml"
        out_path = output_dir / filename
        out_path.write_text(xml_str, encoding="utf-8")

        print(
            f"[{i + 1}/{count}] Oluşturuldu: {out_path.name}  "
            f"| Senaryo: {profile['scenario']:<18} "
            f"| Yaş: {profile['birth_offset_years']}"
        )

    print(f"\n[OK] {count} adet sentetik XML '{output_dir}' dizinine yazildi.")


# ---------------------------------------------------------------------------
# CLI GİRİŞ NOKTASI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Gazi SFT — Vyaire formatında sentetik XML üretici",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--output-dir",
        "-o",
        type=Path,
        default=Path("./mock_xmls"),
        help="Üretilen XML dosyalarının yazılacağı dizin",
    )
    parser.add_argument(
        "--count",
        "-n",
        type=int,
        default=5,
        choices=range(1, 6),
        metavar="1-5",
        help="Üretilecek dosya sayısı (maks 5 farklı hasta profili)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Rastgele sayı üreteci tohumu (tekrar üretilebilirlik için)",
    )
    args = parser.parse_args()

    if args.count > len(PATIENT_PROFILES):
        print(f"[HATA] En fazla {len(PATIENT_PROFILES)} profil mevcut.", file=sys.stderr)
        sys.exit(1)

    generate_mock_xmls(
        output_dir=args.output_dir,
        count=args.count,
        seed=args.seed,
    )


if __name__ == "__main__":
    main()
