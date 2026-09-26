// ─────────────────────────────────────────────────────────────
// types/index.ts
// Gazi SFT Portal — Merkezi TypeScript Tip Tanımları
// ─────────────────────────────────────────────────────────────

// ─── API: Kohort ─────────────────────────────────────────────
export interface CohortPatient {
  patient_id: number;
  external_id: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  ethnic_group: string | null;
  visit_id: number;
  visit_datetime: string | null;
  age: number | null;
  biological_gender: string | null;
  height_m: number | null;
  weight_kg: number | null;
  prediction_module: string | null;
  level_type: string;           // 'Pre' | 'Post'
  trial_id: number;
  fev1_val: number | null;
  fvc_val: number | null;
  fev1_fvc_ratio: number | null;
  pef_val: number | null;
  fev1_pred_percent: number | null;
  fvc_pred_percent: number | null;
  reversibility_positive: boolean | null;
}

export interface CohortResponse {
  total: number;
  filters_applied: Record<string, unknown>;
  results: CohortPatient[];
}

// ─── API: Eğri ───────────────────────────────────────────────
export interface CurvePoint {
  x: number;
  y: number;
}

export interface CurveGroup {
  curve_id: number;
  trial_id: number;
  curve_type: string;   // TYPE_FVC_EX | TYPE_FVC_IN | TYPE_TIFF_EX
  curve_scope: string;  // REPORT | RAW
  data_type: string;    // SpirFvc | SpirTiff
  x_unit: string;       // ml | ms
  y_unit: string;       // ml/s | ml
  sample_rate: string;
  point_count: number;
  points: CurvePoint[];
}

export interface CurvesResponse {
  trial_id: number;
  curves: CurveGroup[];
}

// ─── API: Upload ─────────────────────────────────────────────
export interface UploadResult {
  filename: string;
  sha256: string;
  status: 'SUCCESS' | 'SKIPPED_DUPLICATE' | 'FAILED_QUARANTINE' | 'PENDING';
  patient_external_id: string | null;
  patient_db_id: number | null;
  error_message: string | null;
  duration_ms: number;
}

export interface UploadResponse {
  total_uploaded: number;
  success: number;
  skipped_duplicates: number;
  failed: number;
  results: UploadResult[];
}

// ─── Filter State ─────────────────────────────────────────────
export interface FilterState {
  min_age: number | '';
  max_age: number | '';
  gender: '' | 'Male' | 'Female';
  min_fev1_pred: number | '';
  max_fev1_pred: number | '';
  min_fvc_pred: number | '';
  max_fvc_pred: number | '';
  reversibility_positive: boolean | null;
  level_type: '' | 'Pre' | 'Post';
}

export const DEFAULT_FILTERS: FilterState = {
  min_age: '',
  max_age: '',
  gender: '',
  min_fev1_pred: '',
  max_fev1_pred: '',
  min_fvc_pred: '',
  max_fvc_pred: '',
  reversibility_positive: null,
  level_type: 'Pre',
};

// ─── Severity Util ────────────────────────────────────────────
export type SeverityLevel = 'normal' | 'mild' | 'moderate' | 'severe' | 'unknown';

export function fev1Severity(pct: number | null): SeverityLevel {
  if (pct === null || pct === undefined) return 'unknown';
  if (pct >= 80) return 'normal';
  if (pct >= 70) return 'mild';
  if (pct >= 60) return 'moderate';
  return 'severe';
}

export function severityLabel(s: SeverityLevel): string {
  return { normal: 'Normal', mild: 'Hafif', moderate: 'Orta', severe: 'Ağır', unknown: '—' }[s];
}

export function severityClass(s: SeverityLevel): string {
  return {
    normal:   'badge badge-normal',
    mild:     'badge badge-mild',
    moderate: 'badge badge-moderate',
    severe:   'badge badge-severe',
    unknown:  'badge badge-unknown',
  }[s];
}

export function formatName(p: CohortPatient): string {
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.length ? parts.join(' ') : '—';
}

export function formatGender(g: string | null): string {
  if (!g) return '—';
  return g.toLowerCase().startsWith('m') ? 'Erkek' : 'Kız';
}

export function formatNum(val: number | null, decimals = 2): string {
  if (val === null || val === undefined) return '—';
  return val.toFixed(decimals);
}

// ─── HBYS UI Tipleri ──────────────────────────────────────────
export type HbysMainTab = 
  | 'hasta_detay'
  | 'basvuru_listesi'
  | 'sft_kohort'
  | 'akis_hacim'
  | 'konsultasyon'
  | 'randevu'
  | 'muayene'
  | 'fatura'
  | 'medikal_rapor'
  | 'arsiv';

export type HbysSubTab =
  | 'ozet'
  | 'sft_parametreleri'
  | 'arsiv_dosya'
  | 'ileri_tarihli'
  | 'farkli_merkez';

export interface RecentPatientItem {
  patient_id: number;
  external_id: string;
  name: string;
  gender: string | null;
  age: number | null;
}

