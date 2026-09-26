// ─────────────────────────────────────────────────────────────
// components/FilterPanel.tsx
// Gazi HBYS Klinik Kohort & SFT Filtreleme Paneli
// (Screenshot 1, 2, 3, 4 referanslı grup kutuları ve kompakt form kontrolleri)
// ─────────────────────────────────────────────────────────────

import { Filter, RefreshCw, Search, CheckSquare, Square, Stethoscope } from 'lucide-react';
import type { FilterState } from '../types';
import { DEFAULT_FILTERS } from '../types';

interface FilterPanelProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onFilter: () => void;
  onReset: () => void;
  loading: boolean;
  searchTerm: string;
  onSearchTermChange: (s: string) => void;
}

export function FilterPanel({
  filters,
  onChange,
  onFilter,
  onReset,
  loading,
  searchTerm,
  onSearchTermChange,
}: FilterPanelProps) {
  const set = <K extends keyof FilterState>(key: K, val: FilterState[K]) =>
    onChange({ ...filters, [key]: val });

  const numOrEmpty = (v: string): number | '' =>
    v === '' ? '' : (isNaN(Number(v)) ? '' : Number(v));

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onFilter();
  };

  return (
    <aside
      className="w-64 flex-shrink-0 flex flex-col bg-[#F3F7FB] border-r border-[#9BB7D3] overflow-y-auto select-none"
      onKeyDown={handleKey}
    >
      {/* ─── Panel Başlık ─── */}
      <div className="h-6 px-2.5 bg-gradient-to-b from-[#E9F1F9] to-[#D3E3F3] border-b border-[#A2BCD4] flex items-center justify-between font-bold text-[#103A63] text-xs">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-[#144D87]" />
          <span>SFT Kohort Sorgulama</span>
        </div>
        <span className="text-[10px] text-[#456C93] font-normal">v3.0 XML</span>
      </div>

      <div className="flex-1 p-2 space-y-2">
        {/* ─── Grup 1: Hızlı Arama (Protokol / İsim) ─── */}
        <fieldset className="hbys-groupbox">
          <legend className="hbys-legend flex items-center gap-1">
            <Search className="w-3 h-3 text-[#14477D]" />
            <span>Hasta & Protokol Arama</span>
          </legend>
          <div className="mt-1">
            <input
              type="text"
              placeholder="Protokol, Ad Soyad, TC..."
              value={searchTerm}
              onChange={(e) => onSearchTermChange(e.target.value)}
              className="hbys-input w-full font-sans"
            />
            <p className="text-[10px] text-[#5A7E9F] mt-1 italic">
              Kohort tablosunda anlık filtreleme yapar
            </p>
          </div>
        </fieldset>

        {/* ─── Grup 2: Demografik Kriterler ─── */}
        <fieldset className="hbys-groupbox">
          <legend className="hbys-legend">Demografik Kriterler</legend>

          {/* Yaş Aralığı */}
          <div className="mt-1">
            <label className="text-[11px] font-semibold text-[#18395B] block mb-0.5">
              Yaş Aralığı (0 - 18)
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={18}
                placeholder="Min"
                value={filters.min_age}
                onChange={(e) => set('min_age', numOrEmpty(e.target.value))}
                className="hbys-input w-16 text-center"
              />
              <span className="text-[#6484A4] font-bold">-</span>
              <input
                type="number"
                min={0}
                max={18}
                placeholder="Max"
                value={filters.max_age}
                onChange={(e) => set('max_age', numOrEmpty(e.target.value))}
                className="hbys-input w-16 text-center"
              />
              <span className="text-[10px] text-[#4F7397] font-medium">yaş</span>
            </div>
          </div>

          {/* Cinsiyet */}
          <div className="mt-2">
            <label className="text-[11px] font-semibold text-[#18395B] block mb-0.5">
              Biyolojik Cinsiyet
            </label>
            <div className="flex rounded border border-[#8DA9C5] overflow-hidden bg-white">
              {(['', 'Male', 'Female'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => set('gender', g)}
                  className={`flex-1 py-1 text-[11px] font-medium transition-colors ${
                    filters.gender === g
                      ? 'bg-[#185392] text-white font-bold'
                      : 'bg-white text-[#204060] hover:bg-[#EEF5FC]'
                  }`}
                >
                  {g === '' ? 'Hepsi' : g === 'Male' ? 'Erkek' : 'Kız'}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* ─── Grup 3: Test Seviyesi (Pre / Post BD) ─── */}
        <fieldset className="hbys-groupbox">
          <legend className="hbys-legend">Ölçüm Seviyesi</legend>
          <div className="mt-1 flex rounded border border-[#8DA9C5] overflow-hidden bg-white">
            {(['', 'Pre', 'Post'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => set('level_type', l)}
                className={`flex-1 py-1 text-[11px] font-medium transition-colors ${
                  filters.level_type === l
                    ? 'bg-[#185392] text-white font-bold'
                    : 'bg-white text-[#204060] hover:bg-[#EEF5FC]'
                }`}
              >
                {l === '' ? 'Tümü' : l === 'Pre' ? 'Pre (Bazal)' : 'Post (BD)'}
              </button>
            ))}
          </div>
        </fieldset>

        {/* ─── Grup 4: FEV1 & FVC Parametre Eşikleri ─── */}
        <fieldset className="hbys-groupbox">
          <legend className="hbys-legend flex items-center gap-1">
            <Stethoscope className="w-3 h-3 text-[#14477D]" />
            <span>SFT Parametre Kriterleri</span>
          </legend>

          {/* FEV1 %Pred */}
          <div className="mt-1">
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[11px] font-semibold text-[#18395B]">
                FEV₁ %Predicted
              </label>
              <span className="text-[10px] text-[#55789A]">(GLI / ERS)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={200}
                placeholder="Min %"
                value={filters.min_fev1_pred}
                onChange={(e) => set('min_fev1_pred', numOrEmpty(e.target.value))}
                className="hbys-input w-16 text-center"
              />
              <span className="text-[#6484A4] font-bold">-</span>
              <input
                type="number"
                min={0}
                max={200}
                placeholder="Max %"
                value={filters.max_fev1_pred}
                onChange={(e) => set('max_fev1_pred', numOrEmpty(e.target.value))}
                className="hbys-input w-16 text-center"
              />
              <span className="text-[10px] text-[#4F7397]">%</span>
            </div>

            {/* Hızlı Eşik Butonları */}
            <div className="mt-1 flex gap-1 flex-wrap">
              {[
                { label: '< %80 (Obs)', min: '', max: 79 },
                { label: '< %60 (Ağır)', min: '', max: 59 },
                { label: '≥ %80 (Nor)', min: 80, max: '' },
              ].map(({ label, min, max }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...filters,
                      min_fev1_pred: min as number | '',
                      max_fev1_pred: max as number | '',
                    })
                  }
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#EAF2F9] border border-[#A7C5E0] text-[#14416D] font-medium hover:bg-[#D5E6F6] hover:border-[#7AA4CB]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* FVC %Pred */}
          <div className="mt-2.5">
            <label className="text-[11px] font-semibold text-[#18395B] block mb-0.5">
              FVC %Predicted
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={200}
                placeholder="Min %"
                value={filters.min_fvc_pred}
                onChange={(e) => set('min_fvc_pred', numOrEmpty(e.target.value))}
                className="hbys-input w-16 text-center"
              />
              <span className="text-[#6484A4] font-bold">-</span>
              <input
                type="number"
                min={0}
                max={200}
                placeholder="Max %"
                value={filters.max_fvc_pred}
                onChange={(e) => set('max_fvc_pred', numOrEmpty(e.target.value))}
                className="hbys-input w-16 text-center"
              />
              <span className="text-[10px] text-[#4F7397]">%</span>
            </div>
          </div>
        </fieldset>

        {/* ─── Grup 5: Bronkodilatör Yanıtı (Reversibilite) ─── */}
        <fieldset className="hbys-groupbox">
          <legend className="hbys-legend">Bronkodilatör Yanıtı</legend>
          <div className="mt-1">
            <label
              className="flex items-start gap-1.5 cursor-pointer select-none"
              onClick={() =>
                set(
                  'reversibility_positive',
                  filters.reversibility_positive === true ? null : true
                )
              }
            >
              <div className="mt-0.5 text-[#185392]">
                {filters.reversibility_positive === true ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4 text-[#7A98B6]" />
                )}
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#0E355E]">
                  Reversibilite Pozitif
                </span>
                <p className="text-[10px] text-[#4E7092] leading-tight mt-0.5">
                  ΔFEV₁ ≥ %12 ve ≥ 200 mL
                  <br />
                  <span className="text-[#832626] font-semibold">
                    (ATS/ERS 2019 Pediatrik)
                  </span>
                </p>
              </div>
            </label>
          </div>
        </fieldset>
      </div>

      {/* ─── Aksiyon Butonları (Gazi HBYS Komut Butonları) ─── */}
      <div className="p-2 border-t border-[#A4BDD5] bg-[#E5EEF7] space-y-1.5">
        <button
          onClick={onFilter}
          disabled={loading}
          className="hbys-btn hbys-btn-primary w-full py-1.5"
        >
          {loading ? (
            <span className="spinner" style={{ width: 13, height: 13, borderColor: '#FFFFFF', borderTopColor: '#C5A059' }} />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          <span>{loading ? 'Kohort Taranıyor…' : 'Kohort Sorgula'}</span>
        </button>

        <button
          onClick={onReset}
          disabled={loading}
          className="hbys-btn w-full py-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#14477D]" />
          <span>Filtreleri Temizle</span>
        </button>
      </div>
    </aside>
  );
}
