# Gazi Üniversitesi Tıp Fakültesi Çocuk Alerji Kliniği
## SFT (Solunum Fonksiyon Testi) Ingestion & Hekim Karar Destek Portalı

Bu proje, Gazi Üniversitesi Çocuk Alerji Bilim Dalı bünyesinde kullanılan **Vyaire Medical (MasterScreen/JAEGER)** Solunum Fonksiyon Testi (SFT) cihazlarından alınan XML verilerini ayrıştıran, ilişkisel PostgreSQL veritabanına aktaran ve hekimler için kohort analizi, reversibilite tespiti ile Akış-Hacim (Flow-Volume) eğrisi görselleştirmesi sunan uçtan uca klinik karar destek sistemidir.

---

## 🏗️ Mimari ve Bileşenler

```
├── sft_ingestion/             # Backend & Ingestion Katmanı (Python, FastAPI, PostgreSQL)
│   ├── sql/
│   │   └── init_schema.sql    # PostgreSQL 16+ DDL & mv_spirometry_best_trial view
│   ├── mock_xmls/             # 5 pediatrik senaryoyu içeren sentetik Vyaire XML'leri
│   ├── parser.py              # lxml tabanlı modüler XML ayrıştırıcı & DBWriter
│   ├── run_ingest.py          # Toplu dosya işleme CLI (SHA-256 idempotens & karantina)
│   ├── setup_db.py            # Otomatik veritabanı oluşturma ve şema kurma betiği
│   ├── api.py                 # FastAPI klinik sorgulama, Excel export ve upload API'si
│   ├── mock_data_generator.py # Sentetik Vyaire NIOSH XML üretici
│   └── requirements.txt       # Python bağımlılıkları
├── frontend/                  # Modern Hekim Karar Destek Paneli (Vite, React, Tailwind)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx     # Kurumsal Gazi üst barı & canlı sağlık durumu
│   │   │   ├── FilterPanel.tsx# Yaş, cinsiyet, FEV1 %pred, reversibilite filtreleri
│   │   │   ├── CohortTable.tsx# Dinamik hasta tablosu & ATS/ERS ciddiyet rozetleri
│   │   │   ├── CurvePanel.tsx # Recharts Akış-Hacim eğrisi (Pre Mavi + Post Turuncu)
│   │   │   └── UploadModal.tsx# Sürükle-bırak XML yükleme modalı
│   │   ├── api/client.ts      # Merkezi API istemcisi
│   │   ├── types/index.ts     # TypeScript arayüzleri ve ATS/ERS yardımcıları
│   │   ├── App.tsx            # Ana uygulama koordinatörü
│   │   └── index.css          # Tıbbi tasarım sistemi stilleri
│   ├── package.json           # React, Tailwind, Recharts, Lucide, Axios
│   └── vite.config.ts         # Reverse proxy yapılandırması (Port 3000 -> Port 8000)
├── Gazi Rapor Ornekleri/      # Vyaire cihaz çıktı örnekleri (PDF, XML, GDT, JPG)
└── PROJECT_SPEC.md            # Ayrıntılı mimari ve veri modeli şartnamesi
```

---

## ⚡ Temel Özellikler

1. **İlişkisel Veri Modeli ve EAV Bypass:**
   - Sık filtrelenen klinik parametreler (`fev1_val`, `fvc_val`, `fev1_fvc_ratio`, `pef_val`, `fev1_pred_percent`, `fvc_pred_percent`) fiziksel kolon olarak saklanır.
   - Ham koordinat dizileri satır patlamasını önlemek için `curve` tablosunda `REAL[]` dizileri olarak saklanır.
   - Analitik hızlandırıcı olarak `mv_spirometry_best_trial` materialized view'ı kullanılır.

2. **Mükerrer Dosya Engelleme (SHA-256 Deduplication):**
   - Her dosyanın SHA-256 özeti hesaplanır ve `source_document.sha256` tekil kısıtlaması ile atomik transaction içerisinde yönetilir.

3. **ATS/ERS 2019 Pediatrik Reversibilite Kriteri:**
   - Bronkodilatör yanıtı: $\Delta FEV_1 \ge \%12$ ve $\ge 200\text{ mL}$ artış pozitif olarak etiketlenir.

4. **Akış-Hacim Döngüsü (Flow-Volume Loop) Görselleştirme:**
   - Recharts kütüphanesi kullanılarak Pre (Mavi `#003366`) ve Post (Turuncu `#E05C00`) ekspirasyon/inspirasyon eğrileri aynı koordinat sisteminde üst üste çizdirilir.
   - Yan panelde test parametreleri (FEV₁, FVC, PEF, GLI Z-Score) görüntülenir.

5. **Parametrik Kohort Filtreleme & Excel Aktarımı:**
   - Yaş, cinsiyet, FEV1 %pred aralığı, bronkodilatör yanıtına göre anlık filtreleme ve çok sekmeli Excel (`.xlsx`) çıktısı.

---

## 🚀 Hızlı Başlangıç

### 1. Gereksinimler
- Python 3.10+
- PostgreSQL 14+ (çalışır durumda)
- Node.js 18+ & npm

### 2. Veritabanı ve Şema Kurulumu
```bash
cd sft_ingestion
pip install -r requirements.txt

# .env dosyasını yapılandırın (DATABASE_URL)
# Veritabanını ve şemayı otomatik oluşturmak için:
python setup_db.py

# Sentetik test verilerini yükleyin:
python run_ingest.py --input-dir ./mock_xmls
```

### 3. Backend API'yi Başlatma
```bash
cd sft_ingestion
python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```
- API Dokümantasyonu (Swagger): `http://localhost:8000/docs`

### 4. Frontend Portalını Başlatma
```bash
cd frontend
npm install
npm run dev
```
- Web Arayüzü: `http://localhost:3000`
