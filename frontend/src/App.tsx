// ─────────────────────────────────────────────────────────────
// App.tsx
// Gazi Üniversitesi Tıp Fakültesi Çocuk Alerji ve Astım Kliniği
// Solunum Fonksiyon Testi (SFT) Analiz & Karar Destek Portalı
// Gazi HBYS (NUCLEUS v9.40.66) Masaüstü Arayüz Entegrasyonu
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCohort, fetchCurves } from './api/client';
import { CohortTable } from './components/CohortTable';
import { CurvePanel } from './components/CurvePanel';
import { FilterPanel } from './components/FilterPanel';
import { Header } from './components/Header';
import { LeftSidebar } from './components/LeftSidebar';
import { PatientBanner } from './components/PatientBanner';
import { UploadModal } from './components/UploadModal';
import { ReportModal } from './components/ReportModal';
import type {
  CohortPatient,
  CohortResponse,
  CurvesResponse,
  FilterState,
  HbysMainTab,
  HbysSubTab,
  RecentPatientItem,
} from './types';
import { DEFAULT_FILTERS, formatName } from './types';
import {
  Activity,
  Printer,
  FileSpreadsheet,
  Upload,
  RefreshCw,
  FileText,
  LogOut,
  Search,
  Minus,
  Square,
  X,
  Stethoscope,
  TrendingUp,
} from 'lucide-react';
import { buildExportUrl } from './api/client';

export default function App() {
  // ─── Filtre Durumu ──────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [searchTerm, setSearchTerm] = useState('');

  // ─── Kohort Durumu ──────────────────────────────────────────
  const [cohortData, setCohortData] = useState<CohortResponse | null>(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortError, setCohortError] = useState<string | null>(null);

  // ─── Seçili Hasta & Eğri ────────────────────────────────────
  const [selectedRow, setSelectedRow] = useState<CohortPatient | null>(null);
  const [curvesData, setCurvesData] = useState<CurvesResponse | null>(null);
  const [postCurvesData, setPostCurvesData] = useState<CurvesResponse | null>(null);
  const [curvesLoading, setCurvesLoading] = useState(false);

  // ─── Son Seçilen Hastalar Listesi (Sol Panel) ───────────────
  const [recentPatients, setRecentPatients] = useState<RecentPatientItem[]>([]);

  // ─── HBYS Sekme & Pencere Yönetimi ──────────────────────────
  const [activeMainTab, setActiveMainTab] = useState<HbysMainTab>('sft_kohort');
  const [activeSubTab, setActiveSubTab] = useState<HbysSubTab>('sft_parametreleri');
  const [showOnlyOpen, setShowOnlyOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ─── Modal Durumları ────────────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);
  const [showReport, setShowReport] = useState(false);

  // İstek ID referansı (stale response önleme)
  const fetchIdRef = useRef(0);

  // ─── Kohort Sorgulama ────────────────────────────────────────
  const runCohortQuery = useCallback(async (f: FilterState) => {
    const id = ++fetchIdRef.current;
    setCohortLoading(true);
    setCohortError(null);

    try {
      const res = await fetchCohort(f, 500);
      if (fetchIdRef.current !== id) return;
      setCohortData(res);

      // İlk hasta otomatik olarak künye bandında gösterilsin
      if (res.results.length > 0 && !selectedRow) {
        const first = res.results[0];
        setSelectedRow(first);
        loadCurvesForPatient(first, res);
      }
    } catch (e: any) {
      if (fetchIdRef.current !== id) return;
      setCohortError(e?.message ?? 'Sunucu bağlantısı kurulamadı.');
      setCohortData(null);
    } finally {
      if (fetchIdRef.current === id) setCohortLoading(false);
    }
  }, [selectedRow]);

  // İlk açılışta sorgula
  useEffect(() => {
    runCohortQuery(DEFAULT_FILTERS);
  }, [runCohortQuery]);

  const handleFilter = useCallback(() => runCohortQuery(filters), [filters, runCohortQuery]);
  const handleReset = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setSearchTerm('');
    runCohortQuery(DEFAULT_FILTERS);
  }, [runCohortQuery]);

  // ─── Eğri Yükleme Yardımcısı ────────────────────────────────
  const loadCurvesForPatient = async (row: CohortPatient, cohortRes = cohortData) => {
    setCurvesLoading(true);
    try {
      const curves = await fetchCurves(row.trial_id, 'REPORT');
      setCurvesData(curves);

      // Karşı seviyeyi (Pre ↔ Post) bul
      const counterLevelType = row.level_type === 'Pre' ? 'Post' : 'Pre';
      const counterRow = cohortRes?.results.find(
        r =>
          r.patient_id === row.patient_id &&
          r.visit_id === row.visit_id &&
          r.level_type === counterLevelType,
      );

      if (counterRow) {
        try {
          const counterCurves = await fetchCurves(counterRow.trial_id, 'REPORT');
          setPostCurvesData(counterCurves);
        } catch {
          setPostCurvesData(null);
        }
      } else {
        setPostCurvesData(null);
      }
    } catch (err: any) {
      console.warn('Eğri yükleme hatası:', err?.message);
      setCurvesData(null);
      setPostCurvesData(null);
    } finally {
      setCurvesLoading(false);
    }
  };

  // ─── Hasta Satırı Seçimi ────────────────────────────────────
  const handleSelectRow = useCallback(
    async (row: CohortPatient) => {
      setSelectedRow(row);

      // Son Hastalarım listesine ekle
      setRecentPatients(prev => {
        const filtered = prev.filter(p => p.external_id !== row.external_id);
        const item: RecentPatientItem = {
          patient_id: row.patient_id,
          external_id: row.external_id,
          name: formatName(row),
          gender: row.biological_gender,
          age: row.age,
        };
        return [item, ...filtered].slice(0, 8);
      });

      loadCurvesForPatient(row);
    },
    [cohortData],
  );

  // Sol panelden hasta seçimi
  const handleSelectRecentPatient = (extId: string) => {
    const found = cohortData?.results.find(r => r.external_id === extId);
    if (found) {
      handleSelectRow(found);
    }
  };

  // Excel indirme
  const handleExportExcel = () => {
    const url = buildExportUrl(filters);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#D3DFEE] font-sans">
      {/* ─── 1. En Üst Windows / Gazi HBYS Sistem Başlığı & Menüsü ─── */}
      <Header
        onUploadClick={() => setShowUpload(true)}
        onRefreshClick={() => runCohortQuery(filters)}
        onReportClick={() => setShowReport(true)}
        filters={filters}
        cohortTotal={cohortData?.total ?? null}
      />

      {/* ─── 2. Orta Çalışma Alanı (Sol Asistan + Ana MDI Ekranı) ─── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sol Panel: Çok Amaçlı Kullanıcı Asistanı */}
        <LeftSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          recentPatients={recentPatients}
          onSelectRecentPatient={handleSelectRecentPatient}
          onOpenUpload={() => setShowUpload(true)}
          onOpenReport={() => setShowReport(true)}
          onShowCurveView={() => setActiveMainTab('akis_hacim')}
          selectedPatient={selectedRow}
        />

        {/* Ana MDI Penceresi: Hasta Poliklinik İşlemleri */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#E8EEF5] border-l border-[#8FA8C4] overflow-hidden">
          {/* ─── MDI Pencere Başlığı ─── */}
          <div className="hbys-window-titlebar h-6 px-2 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-3.5 h-3.5 rounded-full bg-[#B02A37] text-white flex items-center justify-center text-[8px] font-bold">
                +
              </div>
              <span className="font-bold text-xs tracking-wide truncate">
                Hasta Poliklinik İşlemleri [Çocuk Alerji ve Astım BD — SFT Portalı]
              </span>
            </div>

            {/* Pencere kontrol butonları */}
            <div className="flex items-center">
              <button className="w-5 h-4 flex items-center justify-center hover:bg-white/20 text-white/80">
                <Minus className="w-3 h-3" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center hover:bg-white/20 text-white/80">
                <Square className="w-2.5 h-2.5" />
              </button>
              <button className="w-5 h-4 flex items-center justify-center hover:bg-[#D32F2F] text-white/80">
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* ─── Üst Arama & Hastane Seçim Barı (Screenshot 1 & 2) ─── */}
          <div className="h-7 px-2.5 bg-[#FAFBFD] border-b border-[#AEC5DC] flex items-center justify-between text-xs flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[#A62424]">Hastane:</span>
              <select className="hbys-select text-[11px] font-medium text-[#113253]">
                <option>Gazi Hastanesi / Çocuk Alerji Polikliniği</option>
                <option>Hepsi</option>
              </select>
            </div>

            {/* Hasta Hızlı Arama Alanları */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-semibold text-[#18395B]">Hasta Arama:</span>
                <input
                  type="text"
                  placeholder="TC / Protokol / İsim..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="hbys-input w-48 text-[11px]"
                />
              </div>

              <button
                onClick={() => runCohortQuery(filters)}
                className="hbys-btn py-0.5 px-2 text-[11px]"
                title="Sorgula"
              >
                <Search className="w-3 h-3 text-[#14477D]" />
                <span>Bul</span>
              </button>
            </div>
          </div>

          {/* ─── HBYS Ana Modül Sekmeleri (Screenshot 1 & 2) ─── */}
          <div className="flex items-center px-1 pt-1 bg-[#DEE9F4] border-b border-[#9DB8D3] gap-0.5 flex-shrink-0 overflow-x-auto">
            <button
              onClick={() => setActiveMainTab('hasta_detay')}
              className={`hbys-tab ${activeMainTab === 'hasta_detay' ? 'active' : ''}`}
            >
              Hasta Detay
            </button>
            <button
              onClick={() => setActiveMainTab('basvuru_listesi')}
              className={`hbys-tab ${activeMainTab === 'basvuru_listesi' ? 'active' : ''}`}
            >
              Başvuru Listesi
            </button>
            <button
              onClick={() => setActiveMainTab('sft_kohort')}
              className={`hbys-tab ${activeMainTab === 'sft_kohort' ? 'active' : ''}`}
            >
              SFT Kohort & Analiz
            </button>
            <button
              onClick={() => setActiveMainTab('akis_hacim')}
              className={`hbys-tab ${activeMainTab === 'akis_hacim' ? 'active' : ''}`}
            >
              Akış-Hacim Eğrisi (F-V)
            </button>
            <button
              onClick={() => setActiveMainTab('konsultasyon')}
              className={`hbys-tab ${activeMainTab === 'konsultasyon' ? 'active' : ''}`}
            >
              Konsültasyon Listesi
            </button>
            <button
              onClick={() => setActiveMainTab('randevu')}
              className={`hbys-tab ${activeMainTab === 'randevu' ? 'active' : ''}`}
            >
              Randevu Listesi
            </button>
            <button
              onClick={() => setActiveMainTab('muayene')}
              className={`hbys-tab ${activeMainTab === 'muayene' ? 'active' : ''}`}
            >
              Muayene Listesi
            </button>
            <button
              onClick={() => setActiveMainTab('fatura')}
              className={`hbys-tab ${activeMainTab === 'fatura' ? 'active' : ''}`}
            >
              Fatura Listesi
            </button>
            <button
              onClick={() => setActiveMainTab('medikal_rapor')}
              className={`hbys-tab ${activeMainTab === 'medikal_rapor' ? 'active' : ''}`}
            >
              Medikal Rapor Listesi
            </button>
            <button
              onClick={() => setActiveMainTab('arsiv')}
              className={`hbys-tab ${activeMainTab === 'arsiv' ? 'active' : ''}`}
            >
              Arşiv İşlemleri
            </button>
          </div>

          {/* ─── HASTA KÜNYE BANDI (Screenshot 1 & 2) ─── */}
          <PatientBanner
            patient={selectedRow}
            activeSubTab={activeSubTab}
            onSubTabChange={setActiveSubTab}
            showOnlyOpen={showOnlyOpen}
            onToggleOnlyOpen={() => setShowOnlyOpen(!showOnlyOpen)}
          />

          {/* ─── Ana İçerik / Tablo ve Eğri Alanı ─── */}
          <div className="flex-1 flex min-h-0 overflow-hidden bg-[#EFF4FA]">
            {/* Sol Filtre Paneli (Gazi HBYS formatında) */}
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              onFilter={handleFilter}
              onReset={handleReset}
              loading={cohortLoading}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
            />

            {/* Sağ Veri Alanı */}
            <div className="flex-1 flex flex-col p-1.5 gap-1.5 min-w-0 overflow-hidden">
              {/* Ana Görünüm: SFT Kohort & Analiz Sekmesi */}
              {activeMainTab === 'sft_kohort' && (
                <>
                  {/* Kohort Tablosu */}
                  <div
                    className="min-h-0 overflow-hidden transition-all duration-150"
                    style={{ flex: selectedRow ? '0 0 52%' : '1 1 auto' }}
                  >
                    <CohortTable
                      data={cohortData}
                      loading={cohortLoading}
                      error={cohortError}
                      selectedRow={selectedRow}
                      onSelectRow={handleSelectRow}
                      searchTerm={searchTerm}
                      onOpenReport={() => setShowReport(true)}
                      onShowCurves={() => setActiveMainTab('akis_hacim')}
                    />
                  </div>

                  {/* Alt Panel: Akış-Hacim Eğrisi (Hasta seçildiğinde belirir) */}
                  {selectedRow && (
                    <div className="flex-1 min-h-0 overflow-hidden">
                      <CurvePanel
                        row={selectedRow}
                        curvesData={curvesData}
                        postCurvesData={postCurvesData}
                        loading={curvesLoading}
                        onClose={() => {
                          setSelectedRow(null);
                          setCurvesData(null);
                          setPostCurvesData(null);
                        }}
                        onOpenReport={() => setShowReport(true)}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Akış-Hacim Eğrisi Tam Ekran Sekmesi */}
              {activeMainTab === 'akis_hacim' && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  {selectedRow ? (
                    <CurvePanel
                      row={selectedRow}
                      curvesData={curvesData}
                      postCurvesData={postCurvesData}
                      loading={curvesLoading}
                      onClose={() => setActiveMainTab('sft_kohort')}
                      onOpenReport={() => setShowReport(true)}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center bg-white border border-[#9BB7D3] rounded p-6 text-center">
                      <Activity className="w-12 h-12 text-[#7C9CB9] mb-3" />
                      <p className="text-sm font-bold text-[#143B63]">
                        Akış-Hacim Eğrisini Görüntülemek İçin Bir Hasta Seçin
                      </p>
                      <button
                        onClick={() => setActiveMainTab('sft_kohort')}
                        className="mt-3 hbys-btn hbys-btn-primary"
                      >
                        SFT Kohort Listesine Dön
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Medikal Rapor Listesi Sekmesi */}
              {activeMainTab === 'medikal_rapor' && (
                <div className="flex-1 min-h-0 flex flex-col bg-white border border-[#9BB7D3] rounded p-4 overflow-y-auto">
                  <div className="flex items-center justify-between pb-3 border-b border-[#CBD8E6]">
                    <div>
                      <h3 className="font-bold text-sm text-[#0F355C]">
                        Hasta SFT Medikal Raporları
                      </h3>
                      <p className="text-xs text-[#527292]">
                        Seçili hasta için onaylanmış ve taslak solunum raporları
                      </p>
                    </div>
                    <button
                      onClick={() => setShowReport(true)}
                      className="hbys-btn hbys-btn-primary"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Yeni SFT Raporu Hazırla</span>
                    </button>
                  </div>

                  <div className="mt-4">
                    <table className="hbys-table">
                      <thead>
                        <tr>
                          <th className="hbys-th">Rapor No</th>
                          <th className="hbys-th">Tarih</th>
                          <th className="hbys-th">Klinik Tanı</th>
                          <th className="hbys-th">FEV₁ %Pred</th>
                          <th className="hbys-th">Doktor</th>
                          <th className="hbys-th">Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="hbys-tr">
                          <td className="hbys-td font-mono font-bold text-[#0D3660]">SFT-2026/0491</td>
                          <td className="hbys-td">27/09/2026</td>
                          <td className="hbys-td font-medium">J45.0 Alerjik Astım</td>
                          <td className="hbys-td font-bold text-[#BD362F]">%68 (Orta)</td>
                          <td className="hbys-td">Prof. Dr. Gazi Çocuk Alerji</td>
                          <td className="hbys-td">
                            <span className="badge badge-normal">Onaylandı</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Diğer HBYS Sekmeleri için bilgi ekranı */}
              {!['sft_kohort', 'akis_hacim', 'medikal_rapor'].includes(activeMainTab) && (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center bg-white border border-[#9BB7D3] rounded p-6 text-center">
                  <Stethoscope className="w-10 h-10 text-[#7C9CB9] mb-2" />
                  <p className="text-xs font-bold text-[#143B63]">
                    Gazi HBYS Modülü: {activeMainTab.toUpperCase()}
                  </p>
                  <p className="text-[11px] text-[#6384A4] mt-1 max-w-sm">
                    Bu ekran Gazi Hastanesi poliklinik ana sistemi ile senkronizedir. SFT analizlerini
                    incelemek için lütfen "SFT Kohort & Analiz" sekmesine geçiniz.
                  </p>
                  <button
                    onClick={() => setActiveMainTab('sft_kohort')}
                    className="mt-3 hbys-btn hbys-btn-primary"
                  >
                    SFT Kohort Ekranına Dön
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ─── 3. Alt Eylem Butonları Çubuğu (Screenshot 2 Referanslı) ─── */}
          <div className="h-8 px-2 bg-gradient-to-b from-[#FAFBFD] to-[#E3ECF6] border-t border-[#A2BCD4] flex items-center justify-between text-xs flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => window.print()}
                className="hbys-btn py-0.5 px-2.5"
                title="Klinik Görünümü Yazdır"
              >
                <Printer className="w-3.5 h-3.5 text-[#134980]" />
                <span>Yazdır</span>
              </button>

              <button
                onClick={handleExportExcel}
                className="hbys-btn py-0.5 px-2.5"
                title="Kohortu Excel Dosyası Olarak İndir"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#217346]" />
                <span>Excel İndir</span>
              </button>

              <button
                onClick={() => setShowUpload(true)}
                className="hbys-btn py-0.5 px-2.5 font-bold text-[#0E3A68]"
                title="Vyaire SFT XML Dosyası Yükle"
              >
                <Upload className="w-3.5 h-3.5 text-[#185FA5]" />
                <span>XML Yükle</span>
              </button>

              <button
                onClick={() => setShowReport(true)}
                className="hbys-btn py-0.5 px-2.5"
                title="Hasta SFT Raporu Hazırla"
              >
                <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
                <span>Rapor Hazırla</span>
              </button>

              <button
                onClick={() => setActiveMainTab('akis_hacim')}
                className="hbys-btn py-0.5 px-2.5"
                title="Akış-Hacim Eğrisini Tam Ekran Aç"
              >
                <TrendingUp className="w-3.5 h-3.5 text-[#185FA5]" />
                <span>Eğriyi Büyüt</span>
              </button>

              <button
                onClick={() => runCohortQuery(filters)}
                className="hbys-btn py-0.5 px-2.5"
                title="Kohort Verilerini Yenile"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#14477D]" />
                <span>Yenile</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#426487]">
              <span>Gazi Üniversitesi Çocuk Alerji BD</span>
              <button
                className="hbys-btn py-0.5 px-2.5 bg-[#FFF2F2] hover:bg-[#FEE4E4] text-[#A62424] border-[#D69696]"
                title="Sistemden Çıkış"
              >
                <LogOut className="w-3 h-3 text-[#A62424]" />
                <span>Çıkış</span>
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* ─── 4. En Alt Windows / HBYS Görev Çubuğu & Durum Çubuğu ─── */}
      <footer className="hbys-taskbar h-6 px-2 flex items-center justify-between select-none text-[11px] flex-shrink-0">
        {/* Sol Görev Çubuğu Sekmeleri */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveMainTab('sft_kohort')}
            className={`hbys-task-btn ${activeMainTab === 'sft_kohort' ? 'active' : ''}`}
          >
            <span>Hasta Poliklinik İşlemleri</span>
          </button>

          {selectedRow && (
            <button
              onClick={() => setActiveMainTab('akis_hacim')}
              className={`hbys-task-btn ${activeMainTab === 'akis_hacim' ? 'active' : ''}`}
            >
              <span>Akış-Hacim ({selectedRow.external_id})</span>
            </button>
          )}

          {showReport && (
            <button className="hbys-task-btn active">
              <span>SFT Rapor V2</span>
            </button>
          )}
        </div>

        {/* Sağ Durum Panelleri (Recessed Bevels) */}
        <div className="flex items-center gap-1 font-sans">
          <div className="hbys-status-panel">
            <strong>Sistem:</strong> Hazır
          </div>
          <div className="hbys-status-panel">
            <strong>Kullanıcı:</strong> Prof. Dr. Gazi Çocuk Alerji
          </div>
          <div className="hbys-status-panel">
            <strong>IP:</strong> 10.128.4.15
          </div>
          <div className="hbys-status-panel font-mono">
            <strong>NUCLEUS</strong> v9.40.66
          </div>
        </div>
      </footer>

      {/* ─── Modallar ─── */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => runCohortQuery(filters)}
        />
      )}

      {showReport && (
        <ReportModal
          patient={selectedRow}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  );
}
