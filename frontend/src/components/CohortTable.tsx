// ─────────────────────────────────────────────────────────────
// components/CohortTable.tsx
// Kohort veri tablosu — Tıklanabilir satırlar, seviye renklendirmesi
// ─────────────────────────────────────────────────────────────

import { ChevronDown, ChevronUp, ChevronsUpDown, Users } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { CohortPatient, CohortResponse } from '../types';
import {
  fev1Severity, severityLabel, severityClass,
  formatName, formatGender, formatNum,
} from '../types';

interface CohortTableProps {
  data: CohortResponse | null;
  loading: boolean;
  error: string | null;
  selectedRow: CohortPatient | null;
  onSelectRow: (row: CohortPatient) => void;
}

type SortKey = keyof CohortPatient | null;
type SortDir = 'asc' | 'desc';

export function CohortTable({ data, loading, error, selectedRow, onSelectRow }: CohortTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    const rows = data?.results ?? [];
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-gazi-navy" />
      : <ChevronDown className="w-3 h-3 text-gazi-navy" />;
  };

  const TH = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="tbl-head-cell cursor-pointer hover:bg-clinical-rowHover transition-colors"
      onClick={() => handleSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={col} />
      </div>
    </th>
  );

  // ─── Yükleme durumu ───────────────────────────────────────
  if (loading) {
    return (
      <div className="card flex items-center justify-center h-64 animate-fade-in">
        <div className="flex flex-col items-center gap-3">
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <span className="text-sm text-clinical-textSecondary">Kohort sorgulanıyor…</span>
        </div>
      </div>
    );
  }

  // ─── Hata durumu ──────────────────────────────────────────
  if (error) {
    return (
      <div className="card flex items-center justify-center h-48 border-red-200 animate-fade-in">
        <div className="text-center px-6">
          <p className="text-red-600 font-medium mb-1">Sorgu Hatası</p>
          <p className="text-sm text-clinical-textSecondary">{error}</p>
          <p className="text-xs text-clinical-textMuted mt-2">
            Sunucu bağlantısını ve veritabanı durumunu kontrol edin.
          </p>
        </div>
      </div>
    );
  }

  // ─── Boş durum ────────────────────────────────────────────
  if (!data || data.results.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center h-48 animate-fade-in">
        <Users className="w-10 h-10 text-clinical-textMuted mb-3" />
        <p className="text-sm font-medium text-clinical-textSecondary">Kayıt bulunamadı</p>
        <p className="text-xs text-clinical-textMuted mt-1">
          {data
            ? 'Filtre kriterlerini genişletin veya XML yükleyin.'
            : '"Kohort Sorgula" butonuna basın.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col overflow-hidden animate-fade-in">
      {/* Tablo başlığı */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-clinical-border flex-shrink-0">
        <Users className="w-4 h-4 text-gazi-navy" />
        <span className="text-sm font-semibold text-gazi-navy">Kohort Listesi</span>
        <span className="ml-auto text-xs text-clinical-textMuted">
          {sorted.length} / {data.total} kayıt
        </span>
      </div>

      {/* Scroll alanı */}
      <div className="overflow-auto flex-1">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <TH label="Protokol No"  col="external_id" />
              <TH label="Ad Soyad"     col="last_name" />
              <TH label="Yaş"          col="age" />
              <TH label="Cinsiyet"     col="biological_gender" />
              <TH label="Seviye"       col="level_type" />
              <TH label="FEV1 (L)"     col="fev1_val" />
              <TH label="FEV1 %Pred"   col="fev1_pred_percent" />
              <TH label="FVC (L)"      col="fvc_val" />
              <TH label="FVC %Pred"    col="fvc_pred_percent" />
              <TH label="FEV1/FVC"     col="fev1_fvc_ratio" />
              <TH label="PEF (L/s)"    col="pef_val" />
              <th className="tbl-head-cell">Reversibilite</th>
              <th className="tbl-head-cell">Durum</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isSelected = selectedRow?.trial_id === row.trial_id;
              const sev = fev1Severity(row.fev1_pred_percent);
              return (
                <tr
                  key={`${row.trial_id}-${row.level_type}`}
                  className={`tbl-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectRow(row)}
                >
                  <td className="tbl-cell">
                    <span className="font-mono text-xs font-medium text-gazi-navy">
                      {row.external_id}
                    </span>
                  </td>
                  <td className="tbl-cell font-medium">{formatName(row)}</td>
                  <td className="tbl-cell text-center">{row.age ?? '—'}</td>
                  <td className="tbl-cell">{formatGender(row.biological_gender)}</td>
                  <td className="tbl-cell">
                    <span className={`badge text-xs ${
                      row.level_type === 'Pre'
                        ? 'text-blue-700 bg-blue-50'
                        : 'text-orange-700 bg-orange-50'
                    }`}>
                      {row.level_type}
                    </span>
                  </td>
                  <td className="tbl-cell text-right font-mono">{formatNum(row.fev1_val, 2)}</td>
                  <td className="tbl-cell text-right">
                    <span className={severityClass(sev)}>
                      {row.fev1_pred_percent !== null
                        ? `${row.fev1_pred_percent.toFixed(0)}%`
                        : '—'}
                    </span>
                  </td>
                  <td className="tbl-cell text-right font-mono">{formatNum(row.fvc_val, 2)}</td>
                  <td className="tbl-cell text-right">
                    <span className={
                      row.fvc_pred_percent !== null
                        ? (row.fvc_pred_percent >= 80
                          ? 'badge badge-normal'
                          : 'badge badge-mild')
                        : 'text-clinical-textMuted text-xs'
                    }>
                      {row.fvc_pred_percent !== null
                        ? `${row.fvc_pred_percent.toFixed(0)}%`
                        : '—'}
                    </span>
                  </td>
                  <td className="tbl-cell text-right font-mono">
                    {formatNum(row.fev1_fvc_ratio, 1)}
                  </td>
                  <td className="tbl-cell text-right font-mono">{formatNum(row.pef_val, 2)}</td>
                  <td className="tbl-cell">
                    {row.reversibility_positive === true ? (
                      <span className="badge text-xs text-emerald-700 bg-emerald-50">✓ Pozitif</span>
                    ) : row.reversibility_positive === false ? (
                      <span className="badge text-xs text-gray-500 bg-gray-100">Negatif</span>
                    ) : (
                      <span className="text-clinical-textMuted text-xs">—</span>
                    )}
                  </td>
                  <td className="tbl-cell">
                    <span className={`${severityClass(sev)} text-xs`}>
                      {severityLabel(sev)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tablo alt bilgisi */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2
                      border-t border-clinical-border bg-clinical-bg/50">
        <p className="text-xs text-clinical-textMuted">
          Bir satıra tıklayarak akış-hacim eğrisini görüntüleyin
        </p>
        <div className="flex gap-4 text-xs text-clinical-textMuted">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-severity-normal inline-block" /> Normal (≥80%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-severity-mild inline-block" /> Hafif (70–79%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-severity-moderate inline-block" /> Orta (60–69%)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-severity-severe inline-block" /> Ağır (&lt;60%)
          </span>
        </div>
      </div>
    </div>
  );
}
