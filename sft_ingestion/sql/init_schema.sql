-- ============================================================
-- GAZİ ÜNİVERSİTESİ ÇOCUK ALERJİ KLİNİĞİ
-- SFT (Solunum Fonksiyon Testi) MVP Ingestion Katmanı
-- PostgreSQL 16+ DDL Şeması
-- ============================================================
-- Değişiklik Kaydı:
--   v1.0 (2026-09-25): İlk mimari sürüm
--   v1.1 (2026-09-25): curve_point tablosu iptal edildi;
--                      curve tablosuna x_points/y_points REAL[] eklendi.
--                      trial tablosuna çekirdek klinik metrik kolonları eklendi.
--                      Performans indeksleri tanımlandı.
-- ============================================================

-- Şemayı sıfırdan başlatmak için (geliştirme/test ortamı):
-- DROP SCHEMA public CASCADE; CREATE SCHEMA public;

-- --------------------------------------------------------
-- 1. Kaynak Belge Tablosu
--    Her import edilen fiziksel dosyanın kaydıdır.
--    SHA-256 ile mükerrer dosya kontrolü yapılır.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_document (
    id              BIGSERIAL       PRIMARY KEY,
    group_key       VARCHAR(150),
    original_name   VARCHAR(255)    NOT NULL,
    file_type       VARCHAR(20)     NOT NULL DEFAULT 'xml',
    sha256          CHAR(64)        NOT NULL,
    raw_content     BYTEA,                        -- İsteğe bağlı: ham XML arşivi
    parser_version  VARCHAR(50)     NOT NULL DEFAULT '1.0',
    import_status   VARCHAR(30)     NOT NULL DEFAULT 'PENDING',
    --  Olası değerler: PENDING | SUCCESS | SKIPPED_DUPLICATE | FAILED_QUARANTINE
    imported_at     TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    error_details   JSONB,
    CONSTRAINT uq_source_document_sha256 UNIQUE (sha256)
);

COMMENT ON TABLE source_document IS
  'Her import edilen Vyaire XML dosyasını temsil eder. SHA-256 ile idempotens sağlanır.';
COMMENT ON COLUMN source_document.import_status IS
  'PENDING | SUCCESS | SKIPPED_DUPLICATE | FAILED_QUARANTINE';


-- --------------------------------------------------------
-- 2. Hasta Tablosu
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient (
    id              BIGSERIAL       PRIMARY KEY,
    source_system   VARCHAR(100)    NOT NULL DEFAULT 'VYAIRE_LOCAL',
    external_id     VARCHAR(100)    NOT NULL,
    first_name      VARCHAR(150),
    last_name       VARCHAR(150),
    birth_date      DATE,
    ethnic_group    VARCHAR(100),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_patient_source_external UNIQUE (source_system, external_id)
);

COMMENT ON COLUMN patient.external_id IS
  'Vyaire Patient/ExternalId - Gazi HBYS Protokol No ile eşleştirme noktası.';


-- --------------------------------------------------------
-- 3. Ziyaret (Test Seansı) Tablosu
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS visit (
    id                    BIGSERIAL       PRIMARY KEY,
    patient_id            BIGINT          NOT NULL REFERENCES patient(id) ON DELETE CASCADE,
    source_doc_id         BIGINT          REFERENCES source_document(id) ON DELETE SET NULL,
    local_datetime_raw    VARCHAR(50),
    local_datetime        TIMESTAMP,
    utc_datetime          TIMESTAMPTZ,
    age                   INTEGER,
    gender                VARCHAR(30),
    biological_gender     VARCHAR(30),
    height_m              NUMERIC(8, 4),
    weight_kg             NUMERIC(8, 3),
    prediction_module     VARCHAR(100),
    review_status         VARCHAR(30),
    created_at            TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON COLUMN visit.prediction_module IS
  'Örn: GLI 2012, Zapletal, Standard EU — Referans denklem paketi.';


-- --------------------------------------------------------
-- 4. Ölçüm Seviyesi (Pre / Post Bronkodilatör)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS measurement_level (
    id                BIGSERIAL       PRIMARY KEY,
    visit_id          BIGINT          NOT NULL REFERENCES visit(id) ON DELETE CASCADE,
    level_type        VARCHAR(30),      -- 'Pre' veya 'Post'
    sequence_number   INTEGER,
    patient_position  VARCHAR(50)
);

COMMENT ON COLUMN measurement_level.level_type IS
  'Pre (bazal) veya Post (bronkodilatör sonrası) — reversibilite analizi için kritik.';


-- --------------------------------------------------------
-- 5. Ölçüm Tablosu
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS measurement (
    id                    BIGSERIAL       PRIMARY KEY,
    level_id              BIGINT          NOT NULL REFERENCES measurement_level(id) ON DELETE CASCADE,
    measurement_type      VARCHAR(100),   -- 'Spirometry', 'BodyPlethysmography' vb.
    measurement_status    VARCHAR(50),
    local_datetime_raw    VARCHAR(50),
    duration              NUMERIC,
    method_name           VARCHAR(150),
    software_version      VARCHAR(100),
    workstation_name      VARCHAR(150)
);


-- --------------------------------------------------------
-- 6. Deneme (Trial) Tablosu
--    CORE METRİK KOLONLARI: EAV join maliyetini ortadan kaldırmak için
--    en sık filtrelenen klinik parametreler fiziksel kolon olarak tanımlandı.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS trial (
    id                  BIGSERIAL       PRIMARY KEY,
    measurement_id      BIGINT          NOT NULL REFERENCES measurement(id) ON DELETE CASCADE,
    trial_number        INTEGER         NOT NULL,   -- 0 = Best (En İyi), 1..n = denemeler
    status              VARCHAR(100),
    duration            NUMERIC,

    -- -------------------------------------------------------
    -- ÇEKIRDEK KLİNİK METRİK KOLONLARI (EAV bypass)
    -- Değerler: ISO_LITER (L) veya ISO_PER_CENT (%) cinsinden
    -- -------------------------------------------------------
    fev1_val            NUMERIC(10, 4),  -- FEV1 (Litre)
    fvc_val             NUMERIC(10, 4),  -- FVC  (Litre)
    fev1_fvc_ratio      NUMERIC(8, 4),   -- FEV1/FVC oranı (%)
    pef_val             NUMERIC(10, 4),  -- PEF  (L/s)
    fev1_pred_percent   NUMERIC(8, 2),   -- FEV1 % Predicted
    fvc_pred_percent    NUMERIC(8, 2),   -- FVC  % Predicted

    CONSTRAINT uq_trial_measurement_number UNIQUE (measurement_id, trial_number)
);

COMMENT ON COLUMN trial.trial_number IS
  '0 = Best/En İyi deneme; 1, 2, 3 ... bireysel geçerli denemeler.';
COMMENT ON COLUMN trial.fev1_pred_percent IS
  'FEV1 nin referans beklenen değere göre yüzdesi. <80 obstrüksiyon eşiği.';


-- --------------------------------------------------------
-- 7. Deneme Parametre Tablosu (EAV — tüm ham parametreler)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS trial_parameter (
    id                      BIGSERIAL       PRIMARY KEY,
    trial_id                BIGINT          NOT NULL REFERENCES trial(id) ON DELETE CASCADE,
    parameter_id            BIGINT,
    short_name              VARCHAR(50),
    long_name               VARCHAR(255),
    measured_value          NUMERIC,
    predicted_reference_id  BIGINT,
    store_unit              VARCHAR(100),
    display_unit            VARCHAR(100),
    conversion_factor       NUMERIC,
    raw_value               VARCHAR(100),
    CONSTRAINT uq_trial_parameter_key UNIQUE (trial_id, parameter_id, short_name)
);


-- --------------------------------------------------------
-- 8. Eğri (Curve) Tablosu — curve_point tablosu KALDIRILDI
--    Koordinat dizileri REAL[] formatında bu tabloda tutulur.
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS curve (
    id              BIGSERIAL       PRIMARY KEY,
    trial_id        BIGINT          NOT NULL REFERENCES trial(id) ON DELETE CASCADE,
    curve_scope     VARCHAR(20)     NOT NULL DEFAULT 'REPORT',
    data_type       VARCHAR(100),
    curve_type      VARCHAR(100),
    curve_status    VARCHAR(50),
    sample_rate     VARCHAR(100),
    x_unit          VARCHAR(50),
    y_unit          VARCHAR(50),
    min_x           NUMERIC,
    max_x           NUMERIC,
    min_y           NUMERIC,
    max_y           NUMERIC,

    -- KOORDİNAT DİZİLERİ — satır bazlı curve_point'i değiştirir
    x_points        REAL[],
    y_points        REAL[],

    point_count     INTEGER GENERATED ALWAYS AS (COALESCE(array_length(x_points, 1), 0)) STORED
);

COMMENT ON COLUMN curve.curve_scope IS
  'REPORT: gorselleştirme icin (~200 nokta). RAW: bilimsel arsiv (250 Hz).';
COMMENT ON COLUMN curve.x_points IS
  'X koordinat dizisi (REAL[]). Vyaire Data alaninin "x,y ..." formatindan parse edilir.';
COMMENT ON COLUMN curve.point_count IS
  'Dizi uzunlugu — otomatik hesaplanan saklanan kolon.';


-- ============================================================
-- PERFORMANS İNDEKSLERİ
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_patient_external_id
    ON patient (external_id);

CREATE INDEX IF NOT EXISTS idx_visit_patient_datetime
    ON visit (patient_id, utc_datetime DESC NULLS LAST);

-- Parametrik kohort sorgulama: FEV1 < 80 AND FVC > 90 vb.
CREATE INDEX IF NOT EXISTS idx_trial_core_metrics
    ON trial (fev1_pred_percent, fvc_pred_percent, fev1_fvc_ratio, pef_val);

CREATE INDEX IF NOT EXISTS idx_trial_measurement_id
    ON trial (measurement_id);

CREATE INDEX IF NOT EXISTS idx_trial_parameter_lookup
    ON trial_parameter (short_name, measured_value);

-- Partial index: yalnızca REPORT egrileri — gorselleştirme sorguları
CREATE INDEX IF NOT EXISTS idx_curve_report
    ON curve (trial_id, curve_type)
    WHERE curve_scope = 'REPORT';

CREATE INDEX IF NOT EXISTS idx_curve_trial_scope
    ON curve (trial_id, curve_scope);

CREATE INDEX IF NOT EXISTS idx_source_document_sha256
    ON source_document (sha256);

CREATE INDEX IF NOT EXISTS idx_source_document_status
    ON source_document (import_status, imported_at DESC);


-- ============================================================
-- ANALİTİK HIZLANDIRICI: Klinik Özet Materialized View
-- Yenileme: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_spirometry_best_trial;
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_spirometry_best_trial AS
    SELECT
        p.id                    AS patient_id,
        p.external_id,
        p.first_name,
        p.last_name,
        p.birth_date,
        p.ethnic_group,
        v.id                    AS visit_id,
        v.utc_datetime          AS visit_datetime,
        v.age,
        v.biological_gender,
        v.height_m,
        v.weight_kg,
        v.prediction_module,
        ml.level_type,
        t.id                    AS trial_id,
        t.trial_number,
        t.fev1_val,
        t.fvc_val,
        t.fev1_fvc_ratio,
        t.pef_val,
        t.fev1_pred_percent,
        t.fvc_pred_percent
    FROM patient p
    INNER JOIN visit v              ON v.patient_id = p.id
    INNER JOIN measurement_level ml ON ml.visit_id = v.id
    INNER JOIN measurement m        ON m.level_id = ml.id
    INNER JOIN trial t              ON t.measurement_id = m.id
    WHERE t.trial_number = 0
      AND (m.measurement_type ILIKE '%spiro%' OR t.fev1_val IS NOT NULL)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_spiro_trial
    ON mv_spirometry_best_trial (trial_id);

CREATE INDEX IF NOT EXISTS idx_mv_spiro_patient_visit
    ON mv_spirometry_best_trial (patient_id, visit_datetime DESC);

CREATE INDEX IF NOT EXISTS idx_mv_spiro_clinical_filter
    ON mv_spirometry_best_trial (level_type, fev1_pred_percent, fvc_pred_percent);

COMMENT ON MATERIALIZED VIEW mv_spirometry_best_trial IS
  'Her hastanin en iyi spirometri sonuclarini duzlestirerek tek satirda sunar. '
  'Parametrik kohort sorgularini milisaniyede yanitlar.';
