// ─────────────────────────────────────────────────────────────
// components/CurvePanel.tsx
// Gazi HBYS Akış-Hacim Döngüsü (Flow-Volume Loop) MDI Penceresi
// (Screenshot 1, 3, 4 referanslı HBYS alt pencere yapısı)
// ─────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import {
  Activity,
  Maximize2,
  Minimize2,
  X,
  TrendingUp,
  Printer,
  FileText,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CohortPatient, CurvesResponse } from '../types';
import {
  fev1Severity,
  formatGender,
  formatNum,
  severityClass,
  severityLabel,
} from '../types';

interface CurvePanelProps {
  row: CohortPatient;
  curvesData: CurvesResponse | null;
  postCurvesData: CurvesResponse | null;
  loading: boolean;
  onClose: () => void;
  onOpenReport?: (row: CohortPatient) => void;
}

// Birim dönüşümü: mL → L, mL/s → L/s
const ML_TO_L = 0.001;

interface ChartPoint {
  vol: number;
  flow: number;
}

const EmptyDot = () => <g />;

function extractFlowVolume(curves: CurvesResponse | null): {
  exData: ChartPoint[];
  inData: ChartPoint[];
  maxVol: number;
  maxFlow: number;
} {
  if (!curves) return { exData: [], inData: [], maxVol: 0, maxFlow: 0 };

  const exCurve = curves.curves.find(c => c.curve_type === 'TYPE_FVC_EX');
  const inCurve = curves.curves.find(c => c.curve_type === 'TYPE_FVC_IN');

  const toPoints = (pts: { x: number; y: number }[]): ChartPoint[] =>
    pts.map(p => ({
      vol: +(p.x * ML_TO_L).toFixed(4),
      flow: +(p.y * ML_TO_L).toFixed(4),
    }));

  const exData = exCurve ? toPoints(exCurve.points) : [];
  const inData = inCurve ? toPoints(inCurve.points) : [];

  const allVols = [...exData, ...inData].map(p => p.vol);
  const allFlows = [...exData, ...inData].map(p => Math.abs(p.flow));

  return {
    exData,
    inData,
    maxVol: allVols.length ? Math.max(...allVols) : 5,
    maxFlow: allFlows.length ? Math.max(...allFlows) : 10,
  };
}

// ─── Özel Tooltip ───
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPoint;
  return (
    <div className="bg-[#FFFFFF] border border-[#7F9EB8] shadow-md px-2.5 py-1.5 text-[11px] font-sans">
      <div className="text-[#153E68] font-bold">Ölçüm Noktası</div>
      <div>
        <span className="text-[#557799]">Hacim:</span>{' '}
        <span className="font-mono font-bold text-[#112F4E]">{d?.vol?.toFixed(3)} L</span>
      </div>
      <div>
        <span className="text-[#557799]">Akış:</span>{' '}
        <span className="font-mono font-bold text-[#112F4E]">{d?.flow?.toFixed(3)} L/s</span>
      </div>
    </div>
  );
};

export function CurvePanel({
  row,
  curvesData,
  postCurvesData,
  loading,
  onClose,
  onOpenReport,
}: CurvePanelProps) {
  const [maximized, setMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<'loop' | 'params' | 'reversibility'>('loop');

  const pre = useMemo(() => extractFlowVolume(curvesData), [curvesData]);
  const post = useMemo(() => extractFlowVolume(postCurvesData), [postCurvesData]);

  const maxVol = Math.max(pre.maxVol, post.maxVol, 1);
  const maxFlow = Math.max(pre.maxFlow, post.maxFlow, 1);

  const sev = fev1Severity(row.fev1_pred_percent);
  const zScore =
    row.fev1_pred_percent !== null
      ? (row.fev1_pred_percent - 100) / 11.5
      : null;

  return (
    <div
      className={`flex flex-col bg-white border border-[#7C9EB9] rounded shadow-md overflow-hidden select-none animate-slide-up ${
        maximized ? 'fixed inset-4 z-50 shadow-2xl' : 'h-full'
      }`}
    >
      {/* ─── MDI Pencere Başlık Çubuğu ─── */}
      <div className="hbys-window-titlebar h-7 px-2.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-[#D8E6F5] flex-shrink-0" />
          <span className="font-bold text-xs tracking-wide truncate">
            Akış-Hacim Döngüsü Analizi (Flow-Volume Loop) — [{row.external_id}] {row.first_name} {row.last_name}
          </span>
          <span className="text-[11px] text-[#C5DCF2] font-mono">
            ({formatGender(row.biological_gender)}, {row.age}y)
          </span>
        </div>

        {/* Pencere Kontrolleri */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMaximized(!maximized)}
            className="w-5 h-5 rounded hover:bg-white/20 flex items-center justify-center text-white/90"
            title={maximized ? 'Pencereyi Normal Boyuta Döndür' : 'Pencereyi Büyüt'}
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded hover:bg-[#D32F2F] flex items-center justify-center text-white/90"
            title="Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Alt Sekmeler & Hızlı Butonlar ─── */}
      <div className="h-7 px-2 bg-[#E9F1F9] border-b border-[#A6BED4] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('loop')}
            className={`hbys-subtab text-[11px] ${activeTab === 'loop' ? 'active' : ''}`}
          >
            Akış-Hacim Eğrisi (F-V Loop)
          </button>
          <button
            onClick={() => setActiveTab('params')}
            className={`hbys-subtab text-[11px] ${activeTab === 'params' ? 'active' : ''}`}
          >
            Spirometri Parametreleri
          </button>
          <button
            onClick={() => setActiveTab('reversibility')}
            className={`hbys-subtab text-[11px] ${activeTab === 'reversibility' ? 'active' : ''}`}
          >
            Reversibilite & Değerlendirme
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {onOpenReport && (
            <button
              onClick={() => onOpenReport(row)}
              className="hbys-btn py-0.5 px-2 text-[11px]"
              title="Resmi SFT Raporu Hazırla"
            >
              <FileText className="w-3 h-3 text-[#134F8C]" />
              <span>Rapor Hazırla</span>
            </button>
          )}

          <button
            onClick={() => window.print()}
            className="hbys-btn py-0.5 px-2 text-[11px]"
            title="Eğriyi Yazdır"
          >
            <Printer className="w-3 h-3 text-[#446688]" />
            <span>Yazdır</span>
          </button>
        </div>
      </div>

      {/* ─── Ana İçerik Gövdesi ─── */}
      <div className="flex-1 flex overflow-hidden min-h-0 bg-[#F9FBFE]">
        {/* Sol Taraf: Eğri Grafiği */}
        <div className="flex-1 p-2 flex flex-col min-w-0">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="spinner" style={{ width: 22, height: 22, borderWidth: 3 }} />
                <span className="text-xs text-[#1C4E82] font-semibold">
                  REPORT Seviyesi Akış-Hacim Eğrisi Çiziliyor…
                </span>
              </div>
            </div>
          ) : pre.exData.length === 0 && pre.inData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
              <TrendingUp className="w-10 h-10 text-[#8BA8C4] mb-2" />
              <p className="text-xs font-bold text-[#193F66]">Eğri Verisi Bulunamadı</p>
              <p className="text-[11px] text-[#5A7E9F] mt-1 max-w-xs">
                Bu deneme için `curve_scope = 'REPORT'` koordinat kaydı bulunmamaktadır.
              </p>
            </div>
          ) : (
            <div className="flex-1 w-full h-full min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D1E0EF" />
                  <XAxis
                    type="number"
                    dataKey="vol"
                    domain={[0, +(maxVol * 1.05).toFixed(1)]}
                    tickCount={7}
                    tickFormatter={v => v.toFixed(1)}
                    label={{
                      value: 'Hacim / Volume (Litre)',
                      position: 'insideBottom',
                      offset: -12,
                      style: { fontSize: 10, fill: '#143C66', fontWeight: 600 },
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="flow"
                    domain={[-(maxFlow * 1.1), maxFlow * 1.15]}
                    tickCount={9}
                    tickFormatter={v => v.toFixed(1)}
                    label={{
                      value: 'Akış / Flow (L/s)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 10,
                      style: { fontSize: 10, fill: '#143C66', fontWeight: 600 },
                    }}
                  />
                  <ReferenceLine y={0} stroke="#85A7C8" strokeWidth={1.2} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                    iconType="line"
                  />

                  {/* Pre Ekspirasyon (Gazi Lacivert, Kalın) */}
                  {pre.exData.length > 0 && (
                    <Scatter
                      name="Pre-BD (Bazal) Ekspirasyon"
                      data={pre.exData}
                      fill="#003366"
                      line={{ stroke: '#003366', strokeWidth: 2.2 }}
                      shape={<EmptyDot />}
                    />
                  )}
                  {/* Pre İnspirasyon (Gazi Lacivert, Kesikli) */}
                  {pre.inData.length > 0 && (
                    <Scatter
                      name="Pre-BD (Bazal) İnspirasyon"
                      data={pre.inData}
                      fill="#003366"
                      line={{ stroke: '#003366', strokeWidth: 1.8, strokeDasharray: '4 3' }}
                      shape={<EmptyDot />}
                    />
                  )}
                  {/* Post Ekspirasyon (Turuncu, Kalın) */}
                  {post.exData.length > 0 && (
                    <Scatter
                      name="Post-BD (Bronkodilatör) Ekspirasyon"
                      data={post.exData}
                      fill="#E05C00"
                      line={{ stroke: '#E05C00', strokeWidth: 2.2 }}
                      shape={<EmptyDot />}
                    />
                  )}
                  {/* Post İnspirasyon (Turuncu, Kesikli) */}
                  {post.inData.length > 0 && (
                    <Scatter
                      name="Post-BD (Bronkodilatör) İnspirasyon"
                      data={post.inData}
                      fill="#E05C00"
                      line={{ stroke: '#E05C00', strokeWidth: 1.8, strokeDasharray: '4 3' }}
                      shape={<EmptyDot />}
                    />
                  )}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Sağ Taraf: Gazi HBYS Parametre Kartları & Klinik Panel */}
        <div className="w-60 flex-shrink-0 border-l border-[#AEC6DD] bg-[#F1F6FB] p-2 overflow-y-auto space-y-2">
          {/* Çekirdek Ölçümler */}
          <fieldset className="hbys-groupbox bg-white">
            <legend className="hbys-legend">Çekirdek Spirometri</legend>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between items-center py-0.5 border-b border-[#EAF0F6]">
                <span className="font-semibold text-[#1B3F63]">FEV₁:</span>
                <span className="font-mono font-bold text-[#0D2F52]">
                  {formatNum(row.fev1_val, 2)} L
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[#EAF0F6]">
                <span className="font-semibold text-[#1B3F63]">FEV₁ %Pred:</span>
                <span className={severityClass(sev)}>
                  {row.fev1_pred_percent !== null ? `%${row.fev1_pred_percent.toFixed(0)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[#EAF0F6]">
                <span className="font-semibold text-[#1B3F63]">FVC:</span>
                <span className="font-mono font-bold text-[#0D2F52]">
                  {formatNum(row.fvc_val, 2)} L
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[#EAF0F6]">
                <span className="font-semibold text-[#1B3F63]">FVC %Pred:</span>
                <span className="font-mono font-bold text-[#0D2F52]">
                  {row.fvc_pred_percent !== null ? `%${row.fvc_pred_percent.toFixed(0)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-b border-[#EAF0F6]">
                <span className="font-semibold text-[#1B3F63]">FEV₁ / FVC:</span>
                <span className="font-mono font-bold text-[#0D2F52]">
                  {formatNum(row.fev1_fvc_ratio, 1)}%
                </span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="font-semibold text-[#1B3F63]">PEF:</span>
                <span className="font-mono font-bold text-[#0D2F52]">
                  {formatNum(row.pef_val, 2)} L/s
                </span>
              </div>
            </div>
          </fieldset>

          {/* Pediatrik Z-Skoru (GLI-2012) */}
          <fieldset className="hbys-groupbox bg-white">
            <legend className="hbys-legend">Pediatrik Z-Skor (GLI-2012)</legend>
            <div className="text-[11px] space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-[#193C60]">FEV₁ Z-Skoru:</span>
                <span
                  className={`font-mono font-bold ${
                    zScore !== null && zScore < -1.64 ? 'text-[#C02A2A]' : 'text-[#126830]'
                  }`}
                >
                  {zScore !== null ? (zScore > 0 ? `+${zScore.toFixed(2)}` : zScore.toFixed(2)) : '—'}
                </span>
              </div>
              <div className="text-[10px] text-[#4F7193] leading-snug">
                {zScore !== null && zScore < -1.64 ? (
                  <span className="text-[#C02A2A] font-bold">
                    ⚠️ LLN Altı (Lower Limit of Normal, &lt; 5. persentil)
                  </span>
                ) : (
                  <span className="text-[#126830] font-semibold">
                    ✓ Normal Referans Sınırları İçinde
                  </span>
                )}
              </div>
            </div>
          </fieldset>

          {/* ATS/ERS Reversibilite Değerlendirmesi */}
          <fieldset className="hbys-groupbox bg-white">
            <legend className="hbys-legend">Bronkodilatör Yanıtı</legend>
            <div className="text-[11px] space-y-1">
              {row.reversibility_positive === true ? (
                <div className="p-1 rounded bg-[#E3F5E7] border border-[#9BD9AA] text-[#126830] font-bold text-center">
                  ✓ Reversibilite Pozitif
                </div>
              ) : row.reversibility_positive === false ? (
                <div className="p-1 rounded bg-[#F2F4F7] border border-[#CBD5E1] text-[#475569] font-semibold text-center">
                  Reversibilite Negatif
                </div>
              ) : (
                <div className="p-1 text-[#64748B] text-center italic text-[10px]">
                  Post-BD ölçümü bulunamadı
                </div>
              )}
              <p className="text-[10px] text-[#557697] leading-tight mt-1">
                Kriter: FEV₁ artışı ≥ %12 ve ≥ 200 mL (ATS/ERS 2019)
              </p>
            </div>
          </fieldset>

          {/* Hasta Bilgileri */}
          <fieldset className="hbys-groupbox bg-white">
            <legend className="hbys-legend">Test & Hasta Detayı</legend>
            <div className="text-[10px] text-[#335373] space-y-0.5">
              <div><strong>Boy:</strong> {row.height_m ? `${(row.height_m * 100).toFixed(0)} cm` : '—'}</div>
              <div><strong>Kilo:</strong> {row.weight_kg ? `${row.weight_kg} kg` : '—'}</div>
              <div><strong>Modül:</strong> {row.prediction_module ?? 'GLI-2012'}</div>
              <div><strong>Etnik:</strong> {row.ethnic_group ?? 'Caucasian'}</div>
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
