// ─────────────────────────────────────────────────────────────
// components/CurvePanel.tsx
// Akış-Hacim Döngüsü (Flow-Volume Loop) görselleştirme paneli
// Pre (mavi) ve Post (turuncu) eğrileri aynı düzlemde üst üste
// ─────────────────────────────────────────────────────────────

import { Activity, TrendingUp, X } from 'lucide-react';
import { useMemo } from 'react';
// Empty dot renderer for Scatter - avoids cluttering the curve with dots
const EmptyDot = () => <g />;
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
import { fev1Severity, formatGender, formatNum, severityClass, severityLabel } from '../types';

interface CurvePanelProps {
  row: CohortPatient;
  curvesData: CurvesResponse | null;
  postCurvesData: CurvesResponse | null;
  loading: boolean;
  onClose: () => void;
}

// Birim dönüşümü: mL → L, mL/s → L/s
const ML_TO_L = 0.001;

interface ChartPoint { vol: number; flow: number }

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
    pts.map(p => ({ vol: +(p.x * ML_TO_L).toFixed(4), flow: +(p.y * ML_TO_L).toFixed(4) }));

  const exData = exCurve ? toPoints(exCurve.points) : [];
  const inData = inCurve ? toPoints(inCurve.points) : [];

  const allVols  = [...exData, ...inData].map(p => p.vol);
  const allFlows = [...exData, ...inData].map(p => Math.abs(p.flow));

  return {
    exData,
    inData,
    maxVol:  allVols.length  ? Math.max(...allVols)  : 6,
    maxFlow: allFlows.length ? Math.max(...allFlows) : 12,
  };
}

// ─── Parametre Kartı ─────────────────────────────────────────
function ParamCard({ label, value, unit, badge }: {
  label: string; value: string; unit?: string; badge?: string;
}) {
  return (
    <div className="bg-clinical-bg rounded-lg px-3 py-2 border border-clinical-border/60">
      <p className="text-xs text-clinical-textMuted font-medium mb-0.5">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-base font-semibold text-clinical-textPrimary font-mono">{value}</span>
        {unit && <span className="text-xs text-clinical-textMuted">{unit}</span>}
      </div>
      {badge && <span className={`${badge} mt-1 inline-block`} />}
    </div>
  );
}

// ─── Özel Tooltip ────────────────────────────────────────────
const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPoint;
  return (
    <div className="card px-3 py-2 text-xs shadow-cardLg">
      <p><span className="text-clinical-textMuted">Hacim:</span>{' '}
        <span className="font-mono font-medium">{d?.vol?.toFixed(3)} L</span></p>
      <p><span className="text-clinical-textMuted">Akış:</span>{' '}
        <span className="font-mono font-medium">{d?.flow?.toFixed(3)} L/s</span></p>
    </div>
  );
};

// ─── ANA BİLEŞEN ─────────────────────────────────────────────
export function CurvePanel({
  row, curvesData, postCurvesData, loading, onClose,
}: CurvePanelProps) {

  const pre  = useMemo(() => extractFlowVolume(curvesData),     [curvesData]);
  const post = useMemo(() => extractFlowVolume(postCurvesData), [postCurvesData]);

  const maxVol  = Math.max(pre.maxVol,  post.maxVol,  1);
  const maxFlow = Math.max(pre.maxFlow, post.maxFlow, 1);

  const sev = fev1Severity(row.fev1_pred_percent);

  return (
    <div className="card flex flex-col overflow-hidden animate-slide-up">
      {/* Panel başlık */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-clinical-border flex-shrink-0">
        <Activity className="w-4 h-4 text-gazi-navy flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-gazi-navy">
            Akış-Hacim Döngüsü
          </span>
          <span className="ml-2 text-xs text-clinical-textMuted">
            {row.external_id} — {row.first_name} {row.last_name}
            {' | '}{formatGender(row.biological_gender)}, {row.age} yaş
            {' | '}{row.prediction_module}
          </span>
        </div>
        <button onClick={onClose} className="btn-ghost p-1.5 rounded-md -mr-1.5">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ─── Eğri Alanı ─── */}
        <div className="flex-1 min-w-0 p-2 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
                <span className="text-xs text-clinical-textSecondary">Eğri yükleniyor…</span>
              </div>
            </div>
          ) : (pre.exData.length === 0 && pre.inData.length === 0) ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <TrendingUp className="w-10 h-10 text-clinical-textMuted mb-2" />
              <p className="text-sm text-clinical-textSecondary">Eğri verisi bulunamadı</p>
              <p className="text-xs text-clinical-textMuted mt-1">
                Bu deneme için REPORT kapsamlı eğri kaydı yok.
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#D1DCE8" />
                <XAxis
                  type="number"
                  dataKey="vol"
                  domain={[0, +(maxVol * 1.05).toFixed(1)]}
                  tickCount={8}
                  tickFormatter={v => v.toFixed(1)}
                  label={{
                    value: 'Hacim (L)',
                    position: 'insideBottom',
                    offset: -14,
                    style: { fontSize: 11, fill: '#4A6080' },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="flow"
                  domain={[-(maxFlow * 1.1), (maxFlow * 1.15)]}
                  tickCount={9}
                  tickFormatter={v => v.toFixed(1)}
                  label={{
                    value: 'Akış (L/s)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 12,
                    style: { fontSize: 11, fill: '#4A6080' },
                  }}
                />
                <ReferenceLine y={0} stroke="#A8BDD4" strokeWidth={1} />
                <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Legend
                  wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                  iconType="line"
                />

                {/* Pre Ekspirasyon (mavi, düz) */}
                {pre.exData.length > 0 && (
                  <Scatter
                    name="Pre – Ekspirasyon"
                    data={pre.exData}
                    fill="#003366"
                    line={{ stroke: '#003366', strokeWidth: 2.2 }}
                    shape={<EmptyDot />}
                  />
                )}
                {/* Pre İnspirasyon (mavi, kesikli) */}
                {pre.inData.length > 0 && (
                  <Scatter
                    name="Pre – İnspirasyon"
                    data={pre.inData}
                    fill="#003366"
                    line={{ stroke: '#003366', strokeWidth: 1.8, strokeDasharray: '5 3' }}
                    shape={<EmptyDot />}
                  />
                )}
                {/* Post Ekspirasyon (turuncu, düz) */}
                {post.exData.length > 0 && (
                  <Scatter
                    name="Post – Ekspirasyon"
                    data={post.exData}
                    fill="#E05C00"
                    line={{ stroke: '#E05C00', strokeWidth: 2.2 }}
                    shape={<EmptyDot />}
                  />
                )}
                {/* Post İnspirasyon (turuncu, kesikli) */}
                {post.inData.length > 0 && (
                  <Scatter
                    name="Post – İnspirasyon"
                    data={post.inData}
                    fill="#E05C00"
                    line={{ stroke: '#E05C00', strokeWidth: 1.8, strokeDasharray: '5 3' }}
                    shape={<EmptyDot />}
                  />
                )}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ─── Parametre Kartları ─── */}
        <div className="w-56 flex-shrink-0 border-l border-clinical-border p-3 overflow-y-auto">
          <p className="section-label">Test Parametreleri</p>

          <div className="space-y-2">
            <ParamCard
              label="FEV₁"
              value={formatNum(row.fev1_val, 2)}
              unit="L"
            />
            <ParamCard
              label="FEV₁ %Pred"
              value={row.fev1_pred_percent !== null ? `${row.fev1_pred_percent.toFixed(0)}%` : '—'}
            />
            <ParamCard
              label="FVC"
              value={formatNum(row.fvc_val, 2)}
              unit="L"
            />
            <ParamCard
              label="FVC %Pred"
              value={row.fvc_pred_percent !== null ? `${row.fvc_pred_percent.toFixed(0)}%` : '—'}
            />
            <ParamCard
              label="FEV₁/FVC"
              value={formatNum(row.fev1_fvc_ratio, 1)}
              unit="%"
            />
            <ParamCard
              label="PEF"
              value={formatNum(row.pef_val, 2)}
              unit="L/s"
            />
            <ParamCard
              label="FEV₁ Z-Score"
              value={
                row.fev1_pred_percent !== null
                  ? (((row.fev1_pred_percent - 100) / 11.5) > 0
                      ? `+${(((row.fev1_pred_percent - 100) / 11.5)).toFixed(2)}`
                      : (((row.fev1_pred_percent - 100) / 11.5)).toFixed(2))
                  : '—'
              }
              unit={
                row.fev1_pred_percent !== null
                  ? ((row.fev1_pred_percent - 100) / 11.5 < -1.64 ? '(< LLN)' : '(GLI)')
                  : undefined
              }
            />
          </div>

          {/* Spirometri Yorumu */}
          <div className="mt-4 pt-3 border-t border-clinical-border">
            <p className="section-label">Spirometri Yorumu</p>
            <div className={`${severityClass(sev)} text-xs py-1 px-2.5`}>
              {severityLabel(sev)} Obstrüksiyon
            </div>
            {row.fev1_fvc_ratio !== null && row.fev1_fvc_ratio < 70 && (
              <p className="text-xs text-clinical-textMuted mt-1.5">
                FEV₁/FVC &lt; 70 → Obstrüktif patern
              </p>
            )}
          </div>

          {/* Reversibilite */}
          <div className="mt-3 pt-3 border-t border-clinical-border">
            <p className="section-label">Bronkodilatör Yanıtı</p>
            {row.reversibility_positive === true ? (
              <div className="badge badge-normal text-xs py-1 px-2.5">
                ✓ Reversibilite Pozitif
              </div>
            ) : row.reversibility_positive === false ? (
              <div className="badge badge-unknown text-xs py-1 px-2.5">
                Reversibilite Negatif
              </div>
            ) : (
              <p className="text-xs text-clinical-textMuted">Hesaplanamadı</p>
            )}
            {post.exData.length > 0 && (
              <p className="text-xs text-clinical-textMuted mt-1.5">
                Post-BD eğrisi yüklendi (turuncu)
              </p>
            )}
          </div>

          {/* Hasta Bilgileri */}
          <div className="mt-3 pt-3 border-t border-clinical-border">
            <p className="section-label">Hasta</p>
            <div className="space-y-1 text-xs text-clinical-textSecondary">
              <div className="flex justify-between">
                <span>Boy</span>
                <span className="font-mono">{row.height_m ? `${(row.height_m * 100).toFixed(0)} cm` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Kilo</span>
                <span className="font-mono">{row.weight_kg ? `${row.weight_kg} kg` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span>Ref. Modül</span>
                <span className="font-medium text-right" style={{ maxWidth: 90, wordBreak: 'break-all' }}>
                  {row.prediction_module ?? '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Etnik Grup</span>
                <span>{row.ethnic_group ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
