// ─────────────────────────────────────────────────────────────
// components/CohortTable.tsx
// Gazi HBYS Kompakt Kohort Tablosu & Sağ Tık Bağlam Menüsü
// (Screenshot 1 & 2 referanslı kompakt masaüstü tablo ve menü)
// ─────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Activity,
  FileText,
  Copy,
  FolderOpen,
  Send,
  UserCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
} from 'lucide-react';
import type { CohortPatient, CohortResponse } from '../types';
import {
  fev1Severity,
  severityLabel,
  severityClass,
  formatName,
  formatGender,
  formatNum,
} from '../types';

interface CohortTableProps {
  data: CohortResponse | null;
  loading: boolean;
  error: string | null;
  selectedRow: CohortPatient | null;
  onSelectRow: (row: CohortPatient) => void;
  searchTerm?: string;
  onOpenReport?: (row: CohortPatient) => void;
  onShowCurves?: (row: CohortPatient) => void;
}

type SortKey = keyof CohortPatient | null;
type SortDir = 'asc' | 'desc';

interface ContextMenuState {
  x: number;
  y: number;
  row: CohortPatient;
}

export function CohortTable({
  data,
  loading,
  error,
  selectedRow,
  onSelectRow,
  searchTerm = '',
  onOpenReport,
  onShowCurves,
}: CohortTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Sıralama
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // Filtreleme (arama terimi) + Sıralama
  const filteredAndSorted = useMemo(() => {
    let rows = data?.results ?? [];

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      rows = rows.filter(r => {
        const name = `${r.first_name ?? ''} ${r.last_name ?? ''}`.toLowerCase();
        const ext = (r.external_id ?? '').toLowerCase();
        const gender = (r.biological_gender ?? '').toLowerCase();
        return name.includes(q) || ext.includes(q) || gender.includes(q);
      });
    }

    if (!sortKey) return rows;

    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, searchTerm]);

  // Sağ tık menüsü kapatma dinleyicisi
  useEffect(() => {
    const handleOutsideClick = () => setContextMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, row: CohortPatient) => {
    e.preventDefault();
    onSelectRow(row);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      row,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setContextMenu(null);
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 opacity-30 inline ml-1" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="w-3 h-3 text-[#003366] inline ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 text-[#003366] inline ml-1" />
    );
  };

  const TH = ({ label, col, align = 'left' }: { label: string; col: SortKey; align?: 'left' | 'right' | 'center' }) => (
    <th
      className={`hbys-th cursor-pointer select-none text-${align}`}
      onClick={() => handleSort(col)}
    >
      <div className={`flex items-center gap-0.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span>{label}</span>
        <SortIcon col={col} />
      </div>
    </th>
  );

  // ─── Yükleme Durumu ───
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-white border border-[#9BBAD6] rounded">
        <div className="flex flex-col items-center gap-2">
          <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
          <span className="text-xs font-semibold text-[#18487A]">
            Gazi HBYS Kohort Kayıtları Taranıyor…
          </span>
        </div>
      </div>
    );
  }

  // ─── Hata Durumu ───
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-white border border-[#E0A8A8] rounded p-4">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-[#BD362F] mx-auto mb-2" />
          <p className="text-xs font-bold text-[#BD362F] mb-1">Sorgu Çalıştırılamadı</p>
          <p className="text-xs text-[#555]">{error}</p>
        </div>
      </div>
    );
  }

  // ─── Boş Veri Durumu ───
  if (!data || data.results.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white border border-[#9BBAD6] rounded p-6 text-center">
        <Activity className="w-10 h-10 text-[#7C9CB9] mb-2" />
        <p className="text-xs font-bold text-[#143B63]">Kriterlere Uygun Hasta Bulunamadı</p>
        <p className="text-[11px] text-[#6384A4] mt-1 max-w-sm">
          Filtre kriterlerini genişletin veya Vyaire Medical SFT XML dosyalarını sisteme yükleyin.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border border-[#9BB7D3] rounded overflow-hidden select-none">
      {/* ─── Tablo Üst Çubuğu (Gazi HBYS Grid Header) ─── */}
      <div className="h-6 px-2 bg-gradient-to-b from-[#F2F7FC] to-[#DCE8F5] border-b border-[#A2BCD4] flex items-center justify-between text-xs font-bold text-[#113C68] flex-shrink-0">
        <div className="flex items-center gap-2">
          <span>Hasta Başvuru & SFT Ölçüm Listesi</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-white text-[#185392] border border-[#A8C7E6] font-mono">
            {filteredAndSorted.length} kayıt
          </span>
        </div>
        <div className="text-[10px] text-[#4E7295] font-normal italic">
          (Çift tıklama / Seçim: Akış-Hacim Eğrisini Açar | Sağ Tık: HBYS Menüsü)
        </div>
      </div>

      {/* ─── Scroll Alanı ─── */}
      <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white min-h-0">
        <table className="hbys-table">
          <thead className="sticky top-0 z-20">
            <tr>
              {/* Gösterge Oku Kolonu */}
              <th className="hbys-th w-5 text-center px-1"></th>
              <TH label="Durum" col={null} />
              <TH label="Protokol No" col="external_id" />
              <TH label="Hasta Adı Soyadı" col="last_name" />
              <TH label="Yaş" col="age" align="center" />
              <TH label="Cinsiyet" col="biological_gender" align="center" />
              <TH label="Seviye" col="level_type" align="center" />
              <TH label="FEV₁ (L)" col="fev1_val" align="right" />
              <TH label="FEV₁ %Pred" col="fev1_pred_percent" align="right" />
              <TH label="FVC (L)" col="fvc_val" align="right" />
              <TH label="FVC %Pred" col="fvc_pred_percent" align="right" />
              <TH label="FEV₁/FVC" col="fev1_fvc_ratio" align="right" />
              <TH label="PEF (L/s)" col="pef_val" align="right" />
              <th className="hbys-th text-center">Reversibilite</th>
              <th className="hbys-th">Spirometri Tanısı</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSorted.map((row) => {
              const isSelected = selectedRow?.trial_id === row.trial_id;
              const sev = fev1Severity(row.fev1_pred_percent);

              return (
                <tr
                  key={`${row.trial_id}-${row.level_type}`}
                  className={`hbys-tr ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectRow(row)}
                  onDoubleClick={() => onShowCurves && onShowCurves(row)}
                  onContextMenu={(e) => handleContextMenu(e, row)}
                >
                  {/* Satır Seçim İndikatörü ▶ */}
                  <td className="hbys-td w-5 text-center px-0.5">
                    {isSelected ? (
                      <span className="text-[#0E3A68] font-bold text-[11px] leading-none">▶</span>
                    ) : (
                      <span className="opacity-0">·</span>
                    )}
                  </td>

                  {/* Durum (HBYS Standardı: 1-Açık) */}
                  <td className="hbys-td">
                    <span className="text-[10px] px-1 py-0.2 rounded bg-[#E4F4E8] text-[#136B2B] font-semibold border border-[#9DD4AC]">
                      1-Açık
                    </span>
                  </td>

                  {/* Protokol No */}
                  <td className="hbys-td font-mono font-bold text-[#0E3D6E]">
                    {row.external_id}
                  </td>

                  {/* Ad Soyad */}
                  <td className="hbys-td font-semibold text-[#112940]">
                    {formatName(row)}
                  </td>

                  {/* Yaş */}
                  <td className="hbys-td text-center font-medium">
                    {row.age !== null ? `${row.age}` : '—'}
                  </td>

                  {/* Cinsiyet */}
                  <td className="hbys-td text-center">
                    {formatGender(row.biological_gender)}
                  </td>

                  {/* Ölçüm Seviyesi (Pre / Post) */}
                  <td className="hbys-td text-center">
                    <span
                      className={`badge text-[10px] ${
                        row.level_type === 'Pre'
                          ? 'text-[#0B4D91] bg-[#E3EEFA] border border-[#A7C8EC]'
                          : 'text-[#9A4209] bg-[#FDF0E7] border border-[#F3C2A1]'
                      }`}
                    >
                      {row.level_type === 'Pre' ? 'Pre (Bazal)' : 'Post (BD)'}
                    </span>
                  </td>

                  {/* FEV1 (L) */}
                  <td className="hbys-td text-right font-mono font-semibold">
                    {formatNum(row.fev1_val, 2)}
                  </td>

                  {/* FEV1 %Pred */}
                  <td className="hbys-td text-right">
                    <span className={severityClass(sev)}>
                      {row.fev1_pred_percent !== null
                        ? `%${row.fev1_pred_percent.toFixed(0)}`
                        : '—'}
                    </span>
                  </td>

                  {/* FVC (L) */}
                  <td className="hbys-td text-right font-mono font-semibold">
                    {formatNum(row.fvc_val, 2)}
                  </td>

                  {/* FVC %Pred */}
                  <td className="hbys-td text-right">
                    <span
                      className={
                        row.fvc_pred_percent !== null
                          ? row.fvc_pred_percent >= 80
                            ? 'badge badge-normal'
                            : 'badge badge-mild'
                          : 'text-[#888]'
                      }
                    >
                      {row.fvc_pred_percent !== null
                        ? `%${row.fvc_pred_percent.toFixed(0)}`
                        : '—'}
                    </span>
                  </td>

                  {/* FEV1 / FVC Oranı */}
                  <td className="hbys-td text-right font-mono font-semibold">
                    {formatNum(row.fev1_fvc_ratio, 1)}%
                  </td>

                  {/* PEF (L/s) */}
                  <td className="hbys-td text-right font-mono">
                    {formatNum(row.pef_val, 2)}
                  </td>

                  {/* Reversibilite Yanıtı */}
                  <td className="hbys-td text-center">
                    {row.reversibility_positive === true ? (
                      <span className="badge badge-normal font-bold">
                        ✓ Pozitif (Δ≥%12)
                      </span>
                    ) : row.reversibility_positive === false ? (
                      <span className="badge badge-unknown">Negatif</span>
                    ) : (
                      <span className="text-[#888] text-[10px]">—</span>
                    )}
                  </td>

                  {/* Spirometri Evresi */}
                  <td className="hbys-td">
                    <span className={`${severityClass(sev)} text-[10px]`}>
                      {severityLabel(sev)} Obstrüksiyon
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Alt Durum ve Renk Skalası Çubuğu ─── */}
      <div className="h-6 px-3 bg-[#EEF4FA] border-t border-[#AEC5DC] flex items-center justify-between text-[11px] text-[#345272] flex-shrink-0">
        <div>
          Toplam Gösterilen: <strong>{filteredAndSorted.length}</strong> / {data.total} kayıt
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[#10B981] inline-block" /> Normal (≥%80)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[#F59E0B] inline-block" /> Hafif (%70–79)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[#F97316] inline-block" /> Orta (%60–69)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-[#EF4444] inline-block" /> Ağır (&lt;%60)
          </span>
        </div>
      </div>

      {/* ─── Gazi HBYS Sağ Tık Bağlam Menüsü (Screenshot 2 Referanslı) ─── */}
      {contextMenu && (
        <div
          className="hbys-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="hbys-context-item font-bold text-[#0B3560]"
            onClick={() => {
              if (onShowCurves) onShowCurves(contextMenu.row);
              setContextMenu(null);
            }}
          >
            <Activity className="w-3.5 h-3.5 text-[#135293]" />
            <span>Akış-Hacim Eğrisini Aç</span>
          </div>

          <div
            className="hbys-context-item font-bold text-[#0B3560]"
            onClick={() => {
              if (onOpenReport) onOpenReport(contextMenu.row);
              setContextMenu(null);
            }}
          >
            <FileText className="w-3.5 h-3.5 text-[#135293]" />
            <span>Hasta SFT Raporu Hazırlama (V2)</span>
          </div>

          <div className="hbys-context-divider" />

          <div
            className="hbys-context-item"
            onClick={() => copyToClipboard(contextMenu.row.external_id)}
          >
            <Copy className="w-3.5 h-3.5 text-[#446587]" />
            <span>Protokol No Kopyala ({contextMenu.row.external_id})</span>
          </div>

          <div
            className="hbys-context-item"
            onClick={() => copyToClipboard(`${contextMenu.row.first_name} ${contextMenu.row.last_name}`)}
          >
            <Copy className="w-3.5 h-3.5 text-[#446587]" />
            <span>Hasta Adını Kopyala</span>
          </div>

          <div className="hbys-context-divider" />

          <div className="hbys-context-item opacity-80">
            <FolderOpen className="w-3.5 h-3.5 text-[#446587]" />
            <span>ASOS Elektronik Vaka Sistemi İşlemleri</span>
          </div>

          <div className="hbys-context-item opacity-80">
            <UserCheck className="w-3.5 h-3.5 text-[#446587]" />
            <span>Hasta Tanı ve Reversibilite Detayı</span>
          </div>

          <div className="hbys-context-item opacity-80">
            <Send className="w-3.5 h-3.5 text-[#446587]" />
            <span>MDS Yatış / Sevk Gönderim</span>
          </div>
        </div>
      )}
    </div>
  );
}
