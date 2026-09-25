// ─────────────────────────────────────────────────────────────
// App.tsx
// Gazi SFT Portal — Ana Uygulama Bileşeni
// Durum yönetimi, veri akışı, düzen koordinasyonu
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCohort, fetchCurves } from './api/client';
import { CohortTable } from './components/CohortTable';
import { CurvePanel } from './components/CurvePanel';
import { FilterPanel } from './components/FilterPanel';
import { Header } from './components/Header';
import { UploadModal } from './components/UploadModal';
import type {
  CohortPatient,
  CohortResponse,
  CurvesResponse,
  FilterState,
} from './types';
import { DEFAULT_FILTERS } from './types';

export default function App() {
  // ─── Filtre Durumu ──────────────────────────────────────────
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // ─── Kohort Durumu ──────────────────────────────────────────
  const [cohortData, setCohortData]   = useState<CohortResponse | null>(null);
  const [cohortLoading, setCohortLoading] = useState(false);
  const [cohortError, setCohortError] = useState<string | null>(null);

  // ─── Seçili Hasta & Eğri ────────────────────────────────────
  const [selectedRow, setSelectedRow]         = useState<CohortPatient | null>(null);
  const [curvesData, setCurvesData]           = useState<CurvesResponse | null>(null);
  const [postCurvesData, setPostCurvesData]   = useState<CurvesResponse | null>(null);
  const [curvesLoading, setCurvesLoading]     = useState(false);

  // ─── Upload Modal ────────────────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);

  // Çift tıklamayı önlemek için istek kimliği ref
  const fetchIdRef = useRef(0);

  // ─── Kohort Sorgulama ────────────────────────────────────────
  const runCohortQuery = useCallback(async (f: FilterState) => {
    const id = ++fetchIdRef.current;
    setCohortLoading(true);
    setCohortError(null);
    setSelectedRow(null);
    setCurvesData(null);
    setPostCurvesData(null);

    try {
      const res = await fetchCohort(f, 500);
      if (fetchIdRef.current !== id) return; // Stale response
      setCohortData(res);
    } catch (e: any) {
      if (fetchIdRef.current !== id) return;
      setCohortError(e?.message ?? 'Sunucu bağlantısı kurulamadı.');
      setCohortData(null);
    } finally {
      if (fetchIdRef.current === id) setCohortLoading(false);
    }
  }, []);

  // İlk mount'ta varsayılan filtrelerle sorgula
  useEffect(() => {
    runCohortQuery(DEFAULT_FILTERS);
  }, [runCohortQuery]);

  const handleFilter = useCallback(() => runCohortQuery(filters), [filters, runCohortQuery]);
  const handleReset  = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    runCohortQuery(DEFAULT_FILTERS);
  }, [runCohortQuery]);

  // ─── Satır Seçimi ve Eğri Yükleme ───────────────────────────
  const handleSelectRow = useCallback(async (row: CohortPatient) => {
    // Aynı satıra tekrar tıklamak seçimi kaldırır
    if (selectedRow?.trial_id === row.trial_id) {
      setSelectedRow(null);
      setCurvesData(null);
      setPostCurvesData(null);
      return;
    }

    setSelectedRow(row);
    setCurvesData(null);
    setPostCurvesData(null);
    setCurvesLoading(true);

    try {
      // Seçili denemenin eğrisini yükle
      const curves = await fetchCurves(row.trial_id, 'REPORT');
      setCurvesData(curves);

      // Aynı hasta/ziyaret için karşı seviyeyi (Pre ↔ Post) bul ve yükle
      const counterLevelType = row.level_type === 'Pre' ? 'Post' : 'Pre';
      const counterRow = cohortData?.results.find(
        r =>
          r.patient_id === row.patient_id &&
          r.visit_id   === row.visit_id   &&
          r.level_type === counterLevelType,
      );

      if (counterRow) {
        try {
          const counterCurves = await fetchCurves(counterRow.trial_id, 'REPORT');
          // Pre seçildiyse postCurvesData, Post seçildiyse de postCurvesData → Pre eğrisi
          // Her iki durumda overlay'i postCurvesData'ya koyuyoruz
          setPostCurvesData(counterCurves);
        } catch {
          // Karşı eğri yoksa sessizce devam et
        }
      }
    } catch (e: any) {
      // Eğri hatasını sessizce handle et, eğri paneli boş gösterir
      console.warn('Eğri yükleme hatası:', e?.message);
    } finally {
      setCurvesLoading(false);
    }
  }, [selectedRow, cohortData]);

  // Upload başarısı → kohort tablosunu yenile
  const handleUploadSuccess = useCallback(() => {
    runCohortQuery(filters);
  }, [filters, runCohortQuery]);

  // ─── RENDER ──────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-clinical-bg">

      {/* Üst bar */}
      <Header
        onUploadClick={() => setShowUpload(true)}
        filters={filters}
        cohortTotal={cohortData?.total ?? null}
      />

      {/* Ana içerik */}
      <div className="flex flex-1 min-h-0">

        {/* Sol filtre paneli */}
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onFilter={handleFilter}
          onReset={handleReset}
          loading={cohortLoading}
        />

        {/* Sağ ana alan */}
        <main className="flex-1 min-w-0 flex flex-col gap-3 p-3 overflow-hidden">

          {/* Kohort Tablosu — Eğri paneli varsa yarı yüksekliği kaplar */}
          <div
            className="min-h-0 overflow-hidden transition-all duration-200"
            style={{ flex: selectedRow ? '0 0 50%' : '1 1 auto' }}
          >
            <CohortTable
              data={cohortData}
              loading={cohortLoading}
              error={cohortError}
              selectedRow={selectedRow}
              onSelectRow={handleSelectRow}
            />
          </div>

          {/* Eğri Paneli — Satır seçilince belirir */}
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
              />
            </div>
          )}
        </main>
      </div>

      {/* Upload Modalı */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={handleUploadSuccess}
        />
      )}
    </div>
  );
}
