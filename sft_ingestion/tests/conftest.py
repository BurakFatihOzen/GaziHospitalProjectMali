"""
conftest.py
===========
Gazi SFT Test Suite — Merkezi Fixture Tanımları

Fixture'lar:
  - db_conn: Canlı PostgreSQL bağlantısı (her test sonunda rollback)
  - client: FastAPI TestClient (production app ile)
  - sample_xml_normal: Normal spirometri XML
  - sample_xml_obstruction: Obstrüktif patern XML
  - sample_xml_reversibility: Reversibilite pozitif XML
  - sample_xml_broken: Bozuk / eksik etiketli XML
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg2
import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

# ─── Ortam değişkenlerini yükle ──────────────────────────────────────────────
_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

DATABASE_URL: str = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:1234@localhost:5432/sft_db",
)

# ─── FastAPI uygulamasını içeri al ───────────────────────────────────────────
# sft_ingestion dizinini sys.path'e ekle
import sys

_sft_dir = str(Path(__file__).resolve().parent.parent)
if _sft_dir not in sys.path:
    sys.path.insert(0, _sft_dir)

from api import app

# =============================================================================
# VERİTABANI BAĞLANTI FIXTURE'I
# =============================================================================


@pytest.fixture(scope="session")
def db_conn():
    """
    Session düzeyinde kalıcı DB bağlantısı.
    Her test için rollback DEĞİL — üretim DB'ye yazılır (entegrasyon testleri).
    Testler benzersiz external_id kullanarak çakışmayı önler.
    """
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    yield conn
    conn.close()


@pytest.fixture
def db_cursor(db_conn):
    """Her test için yeni cursor açar, test sonunda bağlantıyı rollback eder."""
    cur = db_conn.cursor()
    yield cur
    db_conn.rollback()  # Test kalıntısı bırakmaz
    cur.close()


# =============================================================================
# FASTAPI TEST CLIENT FIXTURE'I
# =============================================================================


@pytest.fixture(scope="session")
def client():
    """FastAPI uygulaması için synchronous TestClient."""
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# =============================================================================
# ÖRNEK VYAIRE XML FIXTURE'LARI
# =============================================================================


def _build_xml(
    external_id: str,
    first_name: str,
    last_name: str,
    birth_date: str,
    gender: str,
    age: int,
    height_m: float,
    weight_kg: float,
    visit_date: str,
    level_type: str,
    fev1: float,
    fvc: float,
    fev1_pred_pct: float,
    fvc_pred_pct: float,
    pef: float,
) -> bytes:
    """Minimal ama parser-uyumlu Vyaire NIOSH_XmlExport.V3.0 XML üretir."""
    fev1_fvc = round((fev1 / fvc) * 100, 2) if fvc > 0 else 0.0

    # 30 noktalı sahte FVC ekspirasyonu eğrisi
    x_pts = " ".join(f"{round(i * 0.1, 2)},{round(fev1 * (1 - (i / 30) ** 2), 2)}" for i in range(30))

    xml_str = f"""\
<?xml version="1.0" encoding="UTF-8"?>
<PatientTree xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" Version="NIOSH_XmlExport.V3.0">
  <Patient>
    <ExternalId>{external_id}</ExternalId>
    <FirstName>{first_name}</FirstName>
    <LastName>{last_name}</LastName>
    <Birthdate>{birth_date}</Birthdate>
    <RaceInformation>
      <EthnicGroup>Caucasian</EthnicGroup>
    </RaceInformation>
  </Patient>
  <VisitTrees>
    <VisitTree>
      <Visit LocalDate="{visit_date}T08:00:00" UtcDate="{visit_date}T05:00:00Z">
        <Age>{age}</Age>
        <BiologicalGender>{gender}</BiologicalGender>
        <Height>{height_m}</Height>
        <Weight>{weight_kg}</Weight>
        <PredModuleName>GLI 2012</PredModuleName>
        <Levels>
          <LevelTree>
            <Level Type="{level_type}" Sequence="1" PatientPosition="Sitting"/>
            <Measurements>
              <Measurement MeasurementType="Spirometry" Status="OK">
                <Duration>5.2</Duration>
                <Trials>
                  <Trial Number="0" Status="Valid">
                    <Duration>5.1</Duration>
                    <Parameters>
                      <Parameter ParameterId="65547" ShortName="FEV1 ">
                        <LongName>FEV 1</LongName>
                        <Value>{fev1}</Value>
                        <Unit>
                          <DisplayUnit Name="ISO_LITER" />
                        </Unit>
                      </Parameter>
                      <Parameter ParameterId="65567" ShortName="FVC   ">
                        <LongName>FVC</LongName>
                        <Value>{fvc}</Value>
                        <Unit>
                          <DisplayUnit Name="ISO_LITER" />
                        </Unit>
                      </Parameter>
                      <Parameter ParameterId="65551" ShortName="FEV1%F">
                        <LongName>FEV 1 % FVC</LongName>
                        <Value>{fev1_fvc}</Value>
                        <Unit>
                          <DisplayUnit Name="ISO_PER_CENT" />
                        </Unit>
                      </Parameter>
                      <Parameter ParameterId="65573" ShortName="PEF   ">
                        <LongName>PEF</LongName>
                        <Value>{pef}</Value>
                        <Unit>
                          <DisplayUnit Name="LITER_PER_SECOND" />
                        </Unit>
                      </Parameter>
                      <Parameter ParameterId="65548" ShortName="FEV1%P">
                        <LongName>FEV 1 % Pred</LongName>
                        <Value>{fev1_pred_pct}</Value>
                        <Unit>
                          <DisplayUnit Name="ISO_PER_CENT" />
                        </Unit>
                      </Parameter>
                      <Parameter ParameterId="65568" ShortName="FVC%P ">
                        <LongName>FVC % Pred</LongName>
                        <Value>{fvc_pred_pct}</Value>
                        <Unit>
                          <DisplayUnit Name="ISO_PER_CENT" />
                        </Unit>
                      </Parameter>
                    </Parameters>
                    <ReportCurveData>
                      <Curves>
                        <Curve Type="TYPE_FVC_EX" DataType="SpirFvc" Status="OK">
                          <Data>{x_pts}</Data>
                        </Curve>
                      </Curves>
                    </ReportCurveData>
                  </Trial>
                </Trials>
              </Measurement>
            </Measurements>
          </LevelTree>
        </Levels>
      </Visit>
    </VisitTree>
  </VisitTrees>
</PatientTree>
"""
    return xml_str.encode("utf-8")


@pytest.fixture
def sample_xml_normal() -> bytes:
    """Normal spirometri (FEV1 %Pred ≥ 80) XML fixture'ı."""
    return _build_xml(
        external_id="TST-NORMAL-001",
        first_name="Test",
        last_name="Normal",
        birth_date="2014-06-15",
        gender="Male",
        age=10,
        height_m=1.40,
        weight_kg=35.0,
        visit_date="2026-01-15",
        level_type="Pre",
        fev1=2.10,
        fvc=2.50,
        fev1_pred_pct=88.0,
        fvc_pred_pct=91.0,
        pef=5.20,
    )


@pytest.fixture
def sample_xml_obstruction() -> bytes:
    """Obstrüktif patern (FEV1 %Pred < 80, FEV1/FVC < 70) XML fixture'ı."""
    return _build_xml(
        external_id="TST-OBST-001",
        first_name="Test",
        last_name="Obstruct",
        birth_date="2015-03-20",
        gender="Female",
        age=9,
        height_m=1.28,
        weight_kg=26.0,
        visit_date="2026-02-10",
        level_type="Pre",
        fev1=1.20,
        fvc=1.90,
        fev1_pred_pct=62.0,
        fvc_pred_pct=82.0,
        pef=2.80,
    )


@pytest.fixture
def sample_xml_reversibility_pre() -> bytes:
    """Reversibilite testi: Pre-BD ölçümü XML fixture'ı."""
    return _build_xml(
        external_id="TST-REVERS-001",
        first_name="Test",
        last_name="Revers",
        birth_date="2013-09-10",
        gender="Female",
        age=11,
        height_m=1.45,
        weight_kg=38.0,
        visit_date="2026-03-01",
        level_type="Pre",
        fev1=1.600,  # Pre FEV1 = 1.600 L
        fvc=2.10,
        fev1_pred_pct=68.0,
        fvc_pred_pct=78.0,
        pef=3.50,
    )


@pytest.fixture
def sample_xml_reversibility_post() -> bytes:
    """Reversibilite testi: Post-BD ölçümü XML fixture'ı.
    delta = 1.850 - 1.600 = 0.250 L (250 mL > 200 mL)
    pct change = 250/1600 * 100 = 15.6% > 12% → POZİTİF
    """
    return _build_xml(
        external_id="TST-REVERS-001",
        first_name="Test",
        last_name="Revers",
        birth_date="2013-09-10",
        gender="Female",
        age=11,
        height_m=1.45,
        weight_kg=38.0,
        visit_date="2026-03-01",
        level_type="Post",
        fev1=1.850,  # Post FEV1 = 1.850 L
        fvc=2.30,
        fev1_pred_pct=78.7,
        fvc_pred_pct=87.0,
        pef=4.10,
    )


@pytest.fixture
def sample_xml_broken() -> bytes:
    """Geçersiz / bozuk XML — parser'ın karantina mekanizmasını test etmek için."""
    return b"""<?xml version="1.0" encoding="UTF-8"?>
<SpirobankExport Version="NIOSH_XmlExport.V3.0">
  <PatientTree>
    <!-- ExternalId eksik: parser bunu handle etmeli -->
    <Patient>
      <FirstName>Bozuk</FirstName>
      <!-- TRUNCATED -->
"""


@pytest.fixture
def sample_xml_missing_params() -> bytes:
    """Parametre değerleri eksik XML (FEV1 yok) — parser graceful degradation."""
    return b"""\
<?xml version="1.0" encoding="UTF-8"?>
<SpirobankExport Version="NIOSH_XmlExport.V3.0">
  <PatientTree>
    <Patient>
      <ExternalId>TST-NOPARAM-001</ExternalId>
      <FirstName>No</FirstName>
      <LastName>Params</LastName>
      <Birthdate>2012-01-01</Birthdate>
    </Patient>
    <VisitTree>
      <Visit LocalDate="2026-01-01T08:00:00" UtcDate="2026-01-01T05:00:00Z">
        <Age>12</Age>
        <BiologicalGender>Male</BiologicalGender>
        <Height>1500</Height>
        <Weight>45</Weight>
        <PredModuleName>GLI 2012</PredModuleName>
        <Levels>
          <LevelTree>
            <Level Type="Pre" Sequence="1">
              <Measurements>
                <Measurement MeasurementType="Spirometry" Status="OK">
                  <Trials>
                    <Trial Number="0" Status="Valid">
                      <Parameters/>
                    </Trial>
                  </Trials>
                </Measurement>
              </Measurements>
            </Level>
          </LevelTree>
        </Levels>
      </Visit>
    </VisitTree>
  </PatientTree>
</SpirobankExport>
"""
