// ─────────────────────────────────────────────────────────────
// components/FilterPanel.tsx
// Sol filtre kenar çubuğu — Klinik kohort parametreleri
// ─────────────────────────────────────────────────────────────

import { Filter, RefreshCw, Search } from 'lucide-react';
import type { FilterState } from '../types';
import { DEFAULT_FILTERS } from '../types';

interface FilterPanelProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  onFilter: () => void;
  onReset: () => void;
  loading: boolean;
}

export function FilterPanel({
  filters, onChange, onFilter, onReset, loading,
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
      className="w-64 flex-shrink-0 flex flex-col bg-clinical-card border-r border-clinical-border
                 overflow-y-auto"
    >
      {/* Panel Başlık */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-clinical-border">
        <Filter className="w-4 h-4 text-gazi-navy" />
        <span className="text-sm font-semibold text-gazi-navy">Kohort Filtresi</span>
      </div>

      <div className="flex-1 px-4 py-4 space-y-5" onKeyDown={handleKey}>

        {/* ─── Yaş Aralığı ─── */}
        <div>
          <p className="section-label">Yaş Aralığı</p>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={18} placeholder="Min"
              value={filters.min_age}
              onChange={e => set('min_age', numOrEmpty(e.target.value))}
              className="input-clinical text-center"
            />
            <span className="text-clinical-textMuted text-sm">—</span>
            <input
              type="number" min={0} max={18} placeholder="Max"
              value={filters.max_age}
              onChange={e => set('max_age', numOrEmpty(e.target.value))}
              className="input-clinical text-center"
            />
          </div>
          <p className="text-xs text-clinical-textMuted mt-1">0 – 18 yaş</p>
        </div>

        {/* ─── Cinsiyet ─── */}
        <div>
          <p className="section-label">Cinsiyet</p>
          <div className="flex rounded-md overflow-hidden border border-clinical-border">
            {(['', 'Male', 'Female'] as const).map((g) => (
              <button
                key={g}
                onClick={() => set('gender', g)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors
                  ${filters.gender === g
                    ? 'bg-gazi-navy text-white'
                    : 'bg-white text-clinical-textSecondary hover:bg-clinical-rowHover'
                  }`}
              >
                {g === '' ? 'Tümü' : g === 'Male' ? 'Erkek' : 'Kız'}
              </button>
            ))}
          </div>
        </div>

        {/* ─── Ölçüm Seviyesi ─── */}
        <div>
          <p className="section-label">Ölçüm Seviyesi</p>
          <div className="flex rounded-md overflow-hidden border border-clinical-border">
            {(['', 'Pre', 'Post'] as const).map((l) => (
              <button
                key={l}
                onClick={() => set('level_type', l)}
                className={`flex-1 py-1.5 text-xs font-medium transition-colors
                  ${filters.level_type === l
                    ? 'bg-gazi-navy text-white'
                    : 'bg-white text-clinical-textSecondary hover:bg-clinical-rowHover'
                  }`}
              >
                {l === '' ? 'Tümü' : l}
              </button>
            ))}
          </div>
        </div>

        {/* ─── FEV1 %Pred ─── */}
        <div>
          <p className="section-label">FEV1 %Pred Aralığı</p>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={200} placeholder="Min"
              value={filters.min_fev1_pred}
              onChange={e => set('min_fev1_pred', numOrEmpty(e.target.value))}
              className="input-clinical text-center"
            />
            <span className="text-clinical-textMuted text-sm">—</span>
            <input
              type="number" min={0} max={200} placeholder="Max"
              value={filters.max_fev1_pred}
              onChange={e => set('max_fev1_pred', numOrEmpty(e.target.value))}
              className="input-clinical text-center"
            />
          </div>
          <div className="mt-1.5 flex gap-1.5 flex-wrap">
            {[
              { label: '< 80 (Obs)', min: '', max: 79 },
              { label: '< 60 (Ağır)', min: '', max: 59 },
              { label: '≥ 80 (Nor)', min: 80, max: '' },
            ].map(({ label, min, max }) => (
              <button
                key={label}
                onClick={() => onChange({
                  ...filters,
                  min_fev1_pred: min as number | '',
                  max_fev1_pred: max as number | '',
                })}
                className="text-xs px-2 py-0.5 rounded-full bg-clinical-bg
                           border border-clinical-border text-clinical-textSecondary
                           hover:border-gazi-navy hover:text-gazi-navy transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ─── FVC %Pred ─── */}
        <div>
          <p className="section-label">FVC %Pred Aralığı</p>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={200} placeholder="Min"
              value={filters.min_fvc_pred}
              onChange={e => set('min_fvc_pred', numOrEmpty(e.target.value))}
              className="input-clinical text-center"
            />
            <span className="text-clinical-textMuted text-sm">—</span>
            <input
              type="number" min={0} max={200} placeholder="Max"
              value={filters.max_fvc_pred}
              onChange={e => set('max_fvc_pred', numOrEmpty(e.target.value))}
              className="input-clinical text-center"
            />
          </div>
        </div>

        {/* ─── Reversibilite ─── */}
        <div>
          <p className="section-label">Bronkodilatör Yanıtı</p>
          <label className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={filters.reversibility_positive === true}
              onChange={e => set('reversibility_positive', e.target.checked ? true : null)}
              className="mt-0.5 w-4 h-4 rounded border-clinical-border
                         text-gazi-navy focus:ring-gazi-navy/30 cursor-pointer"
            />
            <div>
              <span className="text-sm text-clinical-textPrimary font-medium group-hover:text-gazi-navy
                               transition-colors">
                Reversibilite Pozitif
              </span>
              <p className="text-xs text-clinical-textMuted leading-snug">
                ΔFEV₁ ≥ %12 ve ≥ 200 mL
                <br />(ATS/ERS 2019 pediatrik kriter)
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* ─── Aksiyon Butonları ─── */}
      <div className="flex-shrink-0 p-4 border-t border-clinical-border space-y-2">
        <button
          onClick={onFilter}
          disabled={loading}
          className="btn-primary w-full justify-center"
        >
          {loading
            ? <span className="spinner" style={{ width: 14, height: 14 }} />
            : <Search className="w-4 h-4" />
          }
          {loading ? 'Sorgulanıyor…' : 'Kohort Sorgula'}
        </button>
        <button
          onClick={onReset}
          disabled={loading}
          className="btn-secondary w-full justify-center"
        >
          <RefreshCw className="w-4 h-4" />
          Sıfırla
        </button>
      </div>
    </aside>
  );
}
