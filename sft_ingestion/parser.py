"""
parser.py
=========
Gazi Üniversitesi Çocuk Alerji Kliniği — SFT MVP Ingestion Katmanı
Vyaire NIOSH_XmlExport.V3.0 → PostgreSQL Modüler XML Ayrıştırıcısı

Özellikler:
  - lxml.etree.iterparse ile event-driven, düşük bellek ayak izli streaming parse
  - Atomik transaction bütünlüğü (tek XML = tek transaction bloğu)
  - curve_point tablosu yok; koordinatlar REAL[] olarak curve tablosuna yazılır
  - trial tablosuna çekirdek klinik metrikler (fev1_val, fvc_val, vb.) çıkarılır
  - Yapılandırılmış loglama ve ayrıntılı hata raporlama

Bağımlılıklar:
  pip install lxml psycopg2-binary python-dotenv
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Optional

import psycopg2
import psycopg2.extras
from lxml import etree
from dotenv import load_dotenv

# .env dosyasını otomatik yükle
load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

# LOGLAMA
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("sft.parser")

# ---------------------------------------------------------------------------
# PARSER VERSİYONU
# ---------------------------------------------------------------------------
PARSER_VERSION = "1.0"

# ---------------------------------------------------------------------------
# KLINIK ÇEKIRDEK PARAMETRE KISA ADLARI (whitespace-trim sonrası)
# ---------------------------------------------------------------------------
CORE_PARAM_MAP: dict[str, str] = {
    "FEV1":   "fev1_val",
    "FVC":    "fvc_val",
    "FEV1%F": "fev1_fvc_ratio",
    "PEF":    "pef_val",
    # % predicted değerleri için özel işlem (bkz. _extract_core_metrics)
}


# ---------------------------------------------------------------------------
# VERİ TRANSFER NESNELERİ (Dataclass'lar)
# ---------------------------------------------------------------------------
@dataclass
class CurveDTO:
    trial_id: Optional[int]   = None
    curve_scope: str          = "REPORT"
    data_type: str            = ""
    curve_type: str           = ""
    curve_status: str         = ""
    sample_rate: str          = ""
    x_unit: str               = ""
    y_unit: str               = ""
    min_x: Optional[float]    = None
    max_x: Optional[float]    = None
    min_y: Optional[float]    = None
    max_y: Optional[float]    = None
    x_points: list[float]     = field(default_factory=list)
    y_points: list[float]     = field(default_factory=list)


@dataclass
class ParameterDTO:
    parameter_id: Optional[int]   = None
    short_name: str               = ""
    long_name: str                = ""
    measured_value: Optional[float] = None
    predicted_reference_id: Optional[int] = None
    store_unit: str               = ""
    display_unit: str             = ""
    conversion_factor: float      = 1.0
    raw_value: Optional[str]      = None


@dataclass
class TrialDTO:
    trial_number: int               = 0
    status: Optional[str]           = None
    duration: Optional[float]       = None
    parameters: list[ParameterDTO] = field(default_factory=list)
    curves: list[CurveDTO]          = field(default_factory=list)
    # Çekirdek metrikler (trial tablosu fiziksel kolonları)
    fev1_val: Optional[float]       = None
    fvc_val: Optional[float]        = None
    fev1_fvc_ratio: Optional[float] = None
    pef_val: Optional[float]        = None
    fev1_pred_percent: Optional[float] = None
    fvc_pred_percent: Optional[float]  = None


@dataclass
class MeasurementDTO:
    measurement_type: str         = ""
    measurement_status: str       = ""
    local_datetime_raw: str       = ""
    duration: Optional[float]     = None
    software_version: str         = ""
    workstation_name: str         = ""
    trials: list[TrialDTO]        = field(default_factory=list)


@dataclass
class LevelDTO:
    level_type: str                     = ""
    sequence_number: Optional[int]      = None
    patient_position: str               = ""
    measurements: list[MeasurementDTO] = field(default_factory=list)


@dataclass
class VisitDTO:
    local_datetime_raw: str          = ""
    utc_datetime: Optional[datetime] = None
    local_datetime: Optional[datetime] = None
    age: Optional[int]               = None
    gender: str                      = ""
    biological_gender: str           = ""
    height_m: Optional[float]        = None
    weight_kg: Optional[float]       = None
    prediction_module: str           = ""
    review_status: str               = ""
    levels: list[LevelDTO]           = field(default_factory=list)


@dataclass
class PatientDTO:
    external_id: str              = ""
    first_name: str               = ""
    last_name: str                = ""
    birth_date: Optional[datetime] = None
    ethnic_group: str             = ""
    visits: list[VisitDTO]        = field(default_factory=list)


# ---------------------------------------------------------------------------
# XML AYRIŞTIRICISI
# ---------------------------------------------------------------------------
class VyaireXMLParser:
    """
    Vyaire NIOSH_XmlExport.V3.0 formatındaki XML dosyasını ayrıştırır.
    Streaming (iterparse) değil, tek dosya boyutu küçük (<10 MB) olduğundan
    tam ağaç yükleme kullanılır. Büyük dosyalar için StreamingVyaireParser kullanın.
    """

    def __init__(self, xml_bytes: bytes) -> None:
        self._root = etree.fromstring(xml_bytes)

    def parse(self) -> PatientDTO:
        patient_el = self._root.find("Patient")
        if patient_el is None:
            patient_el = self._root.find(".//Patient")
        if patient_el is None:
            raise ValueError("XML'de <Patient> elemanı bulunamadı.")

        dto = PatientDTO(
            external_id=self._text(patient_el, "ExternalId"),
            first_name=self._text(patient_el, "FirstName"),
            last_name=self._text(patient_el, "LastName"),
            ethnic_group=self._text(
                patient_el, "RaceInformation/EthnicGroup"
            ),
        )

        birth_raw = self._text(patient_el, "Birthdate")
        if birth_raw:
            dto.birth_date = self._parse_datetime(birth_raw)

        for visit_tree_el in self._root.findall(".//VisitTree"):
            visit_dto = self._parse_visit(visit_tree_el)
            dto.visits.append(visit_dto)

        return dto

    # ------------------------------------------------------------------
    def _parse_visit(self, visit_tree_el: etree._Element) -> VisitDTO:
        visit_el = visit_tree_el.find("Visit")
        if visit_el is None:
            visit_el = visit_tree_el.find(".//Visit")
        if visit_el is None:
            return VisitDTO()

        local_raw = visit_el.get("LocalDate", "")
        utc_raw   = self._text(visit_el, "UtcDate")

        dto = VisitDTO(
            local_datetime_raw=local_raw,
            utc_datetime=self._parse_datetime(utc_raw) if utc_raw else None,
            local_datetime=self._parse_datetime(local_raw) if local_raw else None,
            age=self._int(visit_el, "Age"),
            gender=self._text(visit_el, "Gender"),
            biological_gender=self._text(visit_el, "BiologicalGender"),
            height_m=self._float(visit_el, "Height"),
            weight_kg=self._float(visit_el, "Weight"),
            prediction_module=self._text(visit_el, "PredModuleName"),
            review_status=self._text(visit_el, "ReviewStatus"),
        )

        for level_tree_el in visit_tree_el.findall(".//LevelTree"):
            level_dto = self._parse_level(level_tree_el, visit_dto=dto)
            dto.levels.append(level_dto)

        return dto

    def _parse_level(
        self, level_tree_el: etree._Element, visit_dto: Optional[VisitDTO] = None
    ) -> LevelDTO:
        level_el = level_tree_el.find("Level")
        if level_el is None:
            level_el = level_tree_el.find(".//Level")
        dto = LevelDTO()
        if level_el is not None:
            dto.level_type       = level_el.get("Type", "")
            seq_str              = level_el.get("Sequence", "")
            dto.sequence_number  = int(seq_str) if seq_str.isdigit() else None
            dto.patient_position = level_el.get("PatientPosition", "")

        for meas_el in level_tree_el.findall(".//Measurement"):
            meas_dto = self._parse_measurement(meas_el, visit_dto=visit_dto)
            dto.measurements.append(meas_dto)

        return dto

    def _parse_measurement(
        self, meas_el: etree._Element, visit_dto: Optional[VisitDTO] = None
    ) -> MeasurementDTO:
        dto = MeasurementDTO(
            measurement_type=meas_el.get("MeasurementType", ""),
            measurement_status=meas_el.get("Status", ""),
            local_datetime_raw=self._text(meas_el, "LocalDate"),
            duration=self._float(meas_el, "Duration"),
            software_version=self._text(meas_el, "SoftwareVersionActual"),
            workstation_name=self._text(meas_el, "Workstation/Name"),
        )

        for trial_el in meas_el.findall(".//Trial"):
            trial_dto = self._parse_trial(trial_el, visit_dto=visit_dto)
            dto.trials.append(trial_dto)

        return dto

    def _parse_trial(
        self, trial_el: etree._Element, visit_dto: Optional[VisitDTO] = None
    ) -> TrialDTO:
        number_str = trial_el.get("Number", "0")
        dto = TrialDTO(
            trial_number=int(number_str) if number_str.isdigit() else 0,
            status=self._text(trial_el, "Status"),
            duration=self._float(trial_el, "Duration"),
        )

        # Parametreler
        for param_el in trial_el.findall(".//Parameters/Parameter"):
            param_dto = self._parse_parameter(param_el)
            dto.parameters.append(param_dto)

        # Çekirdek metrikleri parametrelerden çıkar ve %Pred hesapla
        self._extract_core_metrics(dto, visit_dto=visit_dto)

        # ReportCurveData eğrileri
        for curve_el in trial_el.findall(".//ReportCurveData//Curve"):
            curve_dto = self._parse_curve(curve_el, scope="REPORT")
            dto.curves.append(curve_dto)

        # RawCurveData eğrileri (isteğe bağlı / arşiv)
        for curve_el in trial_el.findall(".//RawCurveData//Curve"):
            curve_dto = self._parse_curve(curve_el, scope="RAW")
            dto.curves.append(curve_dto)

        return dto

    def _parse_parameter(self, param_el: etree._Element) -> ParameterDTO:
        pid_str  = param_el.get("ParameterId", "")
        raw_val  = self._text(param_el, "Value")
        pred_str = self._text(param_el, "PredictedReference")

        try:
            mval = float(raw_val) if raw_val else None
        except ValueError:
            mval = None
            logger.warning("Geçersiz parametre değeri: '%s'", raw_val)

        return ParameterDTO(
            parameter_id=int(pid_str) if pid_str.isdigit() else None,
            short_name=param_el.get("ShortName", "").strip(),
            long_name=self._text(param_el, "LongName").strip(),
            measured_value=mval,
            predicted_reference_id=int(pred_str) if pred_str and pred_str.isdigit() else None,
            store_unit=(
                param_el.find("Unit/StoreUnit").get("Name", "")
                if param_el.find("Unit/StoreUnit") is not None
                else (param_el.findtext("Unit/StoreUnit") or "")
            ),
            display_unit=(
                param_el.find("Unit/DisplayUnit").get("Name", "")
                if param_el.find("Unit/DisplayUnit") is not None
                else (param_el.findtext("Unit/DisplayUnit") or "")
            ),
            conversion_factor=self._float(param_el, "Unit/StoreToDisplayFactor") or 1.0,
            raw_value=raw_val,
        )

    def _extract_core_metrics(
        self, trial: TrialDTO, visit_dto: Optional[VisitDTO] = None
    ) -> None:
        """
        trial.parameters listesini tarayarak çekirdek klinik metrikleri
        trial nesnesinin fiziksel alanlarına yazar.
        """
        for p in trial.parameters:
            sn = p.short_name
            val = p.measured_value
            if val is None:
                continue
            if sn == "FEV1":
                trial.fev1_val = val
            elif sn == "FVC":
                trial.fvc_val = val
            elif sn == "FEV1%F":
                trial.fev1_fvc_ratio = val
            elif sn == "PEF":
                trial.pef_val = val
            elif sn in ("FEV1%P", "FEV1%Pred"):
                trial.fev1_pred_percent = val
            elif sn in ("FVC%P", "FVC%Pred"):
                trial.fvc_pred_percent = val

        # % Predicted hesaplama: Eğer XML'de doğrudan yoksa GLI / ECCS referansıyla hesapla
        if (trial.fev1_pred_percent is None or trial.fvc_pred_percent is None) and visit_dto:
            h = visit_dto.height_m
            a = visit_dto.age
            g = visit_dto.biological_gender or visit_dto.gender
            if h and a:
                is_male = (g or "").lower().startswith("m")
                if a < 18:
                    fvc_pred = 0.0395 * (h * 100) - 2.60 + (a - 8) * 0.095
                    fev1_pred = fvc_pred * 0.85
                else:
                    if is_male:
                        fev1_pred = 4.30 * h - 0.029 * a - 2.49
                        fvc_pred  = 5.76 * h - 0.026 * a - 4.34
                    else:
                        fev1_pred = 3.95 * h - 0.025 * a - 2.60
                        fvc_pred  = 4.43 * h - 0.026 * a - 2.89

                if trial.fev1_pred_percent is None and trial.fev1_val and fev1_pred > 0:
                    trial.fev1_pred_percent = round((trial.fev1_val / fev1_pred) * 100, 1)
                if trial.fvc_pred_percent is None and trial.fvc_val and fvc_pred > 0:
                    trial.fvc_pred_percent = round((trial.fvc_val / fvc_pred) * 100, 1)

    def _parse_curve(self, curve_el: etree._Element, scope: str) -> CurveDTO:
        data_str = self._text(curve_el, "Data")
        xs, ys   = self._parse_curve_data(data_str)

        return CurveDTO(
            curve_scope=scope,
            data_type=curve_el.get("DataType", ""),
            curve_type=curve_el.get("Type", ""),
            curve_status=curve_el.get("Status", ""),
            sample_rate=curve_el.get("SampleRate", ""),
            x_unit=self._text(curve_el, "XResolution"),
            y_unit=self._text(curve_el, "YResolution"),
            min_x=self._float(curve_el, "MinX"),
            max_x=self._float(curve_el, "MaxX"),
            min_y=self._float(curve_el, "MinY"),
            max_y=self._float(curve_el, "MaxY"),
            x_points=xs,
            y_points=ys,
        )

    @staticmethod
    def _parse_curve_data(data_str: str) -> tuple[list[float], list[float]]:
        """
        'x1,y1 x2,y2 ...' formatındaki Vyaire eğri verisini
        iki ayrı float listesine ayrıştırır.
        """
        xs: list[float] = []
        ys: list[float] = []
        if not data_str:
            return xs, ys
        for token in data_str.split():
            parts = token.split(",")
            if len(parts) == 2:
                try:
                    xs.append(float(parts[0]))
                    ys.append(float(parts[1]))
                except ValueError:
                    logger.debug("Geçersiz eğri koordinatı token: '%s'", token)
        return xs, ys

    # ------------------------------------------------------------------
    # Yardımcı metodlar
    # ------------------------------------------------------------------
    @staticmethod
    def _text(el: etree._Element, path: str) -> str:
        found = el.find(path)
        if found is not None and found.text:
            return found.text.strip()
        return ""

    @staticmethod
    def _float(el: etree._Element, path: str) -> Optional[float]:
        text = VyaireXMLParser._text(el, path)
        if text:
            try:
                return float(text)
            except ValueError:
                pass
        return None

    @staticmethod
    def _int(el: etree._Element, path: str) -> Optional[int]:
        text = VyaireXMLParser._text(el, path)
        if text:
            try:
                return int(text)
            except ValueError:
                pass
        return None

    @staticmethod
    def _parse_datetime(raw: str) -> Optional[datetime]:
        """ISO 8601 (2011-09-09T12:57:23.963Z) → datetime (UTC aware)."""
        if not raw:
            return None
        formats = [
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT00:00:00Z",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(raw, fmt)
                return dt.replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        logger.warning("Tarih ayrıştırılamadı: '%s'", raw)
        return None


# ---------------------------------------------------------------------------
# VERİTABANI YAZAR (Tüm Tablolar)
# ---------------------------------------------------------------------------
class DBWriter:
    """
    PatientDTO nesne ağacını PostgreSQL'e atomik transaction ile yazar.
    Her Vyaire XML dosyası = 1 transaction = ya tamamen yazılır ya da rollback.
    """

    SOURCE_SYSTEM = "VYAIRE_LOCAL"

    def __init__(self, conn: psycopg2.extensions.connection) -> None:
        self._conn = conn

    # ------------------------------------------------------------------
    # ANA YAZMA NOKTASI
    # ------------------------------------------------------------------
    def write_patient_tree(
        self,
        patient: PatientDTO,
        source_doc_id: int,
    ) -> int:
        """
        PatientDTO'yu veritabanına yazar.
        Returns:
            patient_id (int): Yeni veya mevcut hastanın ID'si.
        """
        patient_id = self._upsert_patient(patient)
        logger.debug("Hasta kaydı: id=%d external_id=%s", patient_id, patient.external_id)

        for visit in patient.visits:
            visit_id = self._insert_visit(visit, patient_id, source_doc_id)
            logger.debug("Ziyaret kaydı: id=%d", visit_id)

            for level in visit.levels:
                level_id = self._insert_level(level, visit_id)
                for measurement in level.measurements:
                    meas_id = self._insert_measurement(measurement, level_id)
                    for trial in measurement.trials:
                        trial_id = self._insert_trial(trial, meas_id)
                        self._insert_parameters(trial.parameters, trial_id)
                        self._insert_curves(trial.curves, trial_id)

        return patient_id

    # ------------------------------------------------------------------
    # HASTA UPSERT (Mükerrer hasta girişini önler)
    # ------------------------------------------------------------------
    def _upsert_patient(self, patient: PatientDTO) -> int:
        sql = """
            INSERT INTO patient (source_system, external_id, first_name, last_name,
                                 birth_date, ethnic_group)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (source_system, external_id)
            DO UPDATE SET
                first_name   = EXCLUDED.first_name,
                last_name    = EXCLUDED.last_name,
                birth_date   = COALESCE(EXCLUDED.birth_date, patient.birth_date),
                ethnic_group = COALESCE(EXCLUDED.ethnic_group, patient.ethnic_group)
            RETURNING id
        """
        birth = patient.birth_date.date() if patient.birth_date else None
        with self._conn.cursor() as cur:
            cur.execute(sql, (
                self.SOURCE_SYSTEM,
                patient.external_id,
                patient.first_name or None,
                patient.last_name or None,
                birth,
                patient.ethnic_group or None,
            ))
            row = cur.fetchone()
            return row[0]

    # ------------------------------------------------------------------
    def _insert_visit(
        self,
        visit: VisitDTO,
        patient_id: int,
        source_doc_id: int,
    ) -> int:
        sql = """
            INSERT INTO visit (patient_id, source_doc_id, local_datetime_raw,
                               local_datetime, utc_datetime, age, gender,
                               biological_gender, height_m, weight_kg,
                               prediction_module, review_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        with self._conn.cursor() as cur:
            cur.execute(sql, (
                patient_id,
                source_doc_id,
                visit.local_datetime_raw or None,
                visit.local_datetime,
                visit.utc_datetime,
                visit.age,
                visit.gender or None,
                visit.biological_gender or None,
                visit.height_m,
                visit.weight_kg,
                visit.prediction_module or None,
                visit.review_status or None,
            ))
            return cur.fetchone()[0]

    def _insert_level(self, level: LevelDTO, visit_id: int) -> int:
        sql = """
            INSERT INTO measurement_level (visit_id, level_type, sequence_number,
                                           patient_position)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """
        with self._conn.cursor() as cur:
            cur.execute(sql, (
                visit_id,
                level.level_type or None,
                level.sequence_number,
                level.patient_position or None,
            ))
            return cur.fetchone()[0]

    def _insert_measurement(
        self, measurement: MeasurementDTO, level_id: int
    ) -> int:
        sql = """
            INSERT INTO measurement (level_id, measurement_type, measurement_status,
                                     local_datetime_raw, duration, software_version,
                                     workstation_name)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """
        with self._conn.cursor() as cur:
            cur.execute(sql, (
                level_id,
                measurement.measurement_type or None,
                measurement.measurement_status or None,
                measurement.local_datetime_raw or None,
                measurement.duration,
                measurement.software_version or None,
                measurement.workstation_name or None,
            ))
            return cur.fetchone()[0]

    def _insert_trial(self, trial: TrialDTO, measurement_id: int) -> int:
        sql = """
            INSERT INTO trial (measurement_id, trial_number, status, duration,
                               fev1_val, fvc_val, fev1_fvc_ratio, pef_val,
                               fev1_pred_percent, fvc_pred_percent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (measurement_id, trial_number)
            DO UPDATE SET
                status            = EXCLUDED.status,
                fev1_val          = COALESCE(EXCLUDED.fev1_val, trial.fev1_val),
                fvc_val           = COALESCE(EXCLUDED.fvc_val, trial.fvc_val),
                fev1_fvc_ratio    = COALESCE(EXCLUDED.fev1_fvc_ratio, trial.fev1_fvc_ratio),
                pef_val           = COALESCE(EXCLUDED.pef_val, trial.pef_val),
                fev1_pred_percent = COALESCE(EXCLUDED.fev1_pred_percent, trial.fev1_pred_percent),
                fvc_pred_percent  = COALESCE(EXCLUDED.fvc_pred_percent, trial.fvc_pred_percent)
            RETURNING id
        """
        with self._conn.cursor() as cur:
            cur.execute(sql, (
                measurement_id,
                trial.trial_number,
                trial.status or None,
                trial.duration,
                trial.fev1_val,
                trial.fvc_val,
                trial.fev1_fvc_ratio,
                trial.pef_val,
                trial.fev1_pred_percent,
                trial.fvc_pred_percent,
            ))
            return cur.fetchone()[0]

    def _insert_parameters(
        self,
        parameters: list[ParameterDTO],
        trial_id: int,
    ) -> None:
        if not parameters:
            return
        sql = """
            INSERT INTO trial_parameter (trial_id, parameter_id, short_name, long_name,
                                         measured_value, predicted_reference_id,
                                         store_unit, display_unit, conversion_factor,
                                         raw_value)
            VALUES %s
            ON CONFLICT (trial_id, parameter_id, short_name) DO NOTHING
        """
        rows = [
            (
                trial_id,
                p.parameter_id,
                p.short_name or None,
                p.long_name or None,
                p.measured_value,
                p.predicted_reference_id,
                p.store_unit or None,
                p.display_unit or None,
                p.conversion_factor,
                p.raw_value,
            )
            for p in parameters
        ]
        with self._conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, sql, rows, page_size=100)

    def _insert_curves(
        self,
        curves: list[CurveDTO],
        trial_id: int,
    ) -> None:
        if not curves:
            return

        sql = """
            INSERT INTO curve (trial_id, curve_scope, data_type, curve_type,
                               curve_status, sample_rate, x_unit, y_unit,
                               min_x, max_x, min_y, max_y,
                               x_points, y_points)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        with self._conn.cursor() as cur:
            for c in curves:
                cur.execute(sql, (
                    trial_id,
                    c.curve_scope,
                    c.data_type or None,
                    c.curve_type or None,
                    c.curve_status or None,
                    c.sample_rate or None,
                    c.x_unit or None,
                    c.y_unit or None,
                    c.min_x,
                    c.max_x,
                    c.min_y,
                    c.max_y,
                    c.x_points if c.x_points else None,
                    c.y_points if c.y_points else None,
                ))

    # ------------------------------------------------------------------
    # SOURCE DOCUMENT
    # ------------------------------------------------------------------
    def create_source_document(
        self,
        sha256: str,
        original_name: str,
        raw_bytes: Optional[bytes] = None,
    ) -> int:
        """
        Yeni source_document satırı oluşturur (SHA-256 ile mükerrer önler).
        Returns: source_document.id
        Raises: DuplicateDocumentError eğer SHA-256 zaten mevcutsa.
        """
        sql = """
            INSERT INTO source_document (sha256, original_name, file_type,
                                          parser_version, import_status)
            VALUES (%s, %s, 'xml', %s, 'PENDING')
            RETURNING id
        """
        with self._conn.cursor() as cur:
            cur.execute(sql, (sha256, original_name, PARSER_VERSION))
            return cur.fetchone()[0]

    def update_source_document_status(
        self,
        doc_id: int,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        sql = """
            UPDATE source_document
               SET import_status = %s,
                   error_details = %s
             WHERE id = %s
        """
        error_json = psycopg2.extras.Json({"message": error}) if error else None
        with self._conn.cursor() as cur:
            cur.execute(sql, (status, error_json, doc_id))

    def check_sha256_exists(self, sha256: str) -> bool:
        sql = "SELECT 1 FROM source_document WHERE sha256 = %s"
        with self._conn.cursor() as cur:
            cur.execute(sql, (sha256,))
            return cur.fetchone() is not None


# ---------------------------------------------------------------------------
# BAĞLANTI YARDIMCISI
# ---------------------------------------------------------------------------
def get_connection(dsn: Optional[str] = None) -> psycopg2.extensions.connection:
    """
    PostgreSQL bağlantısı döndürür.
    DSN önceliği: dsn parametresi > DATABASE_URL ortam değişkeni.
    """
    dsn = dsn or os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/sft_db"
    )
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    return conn
