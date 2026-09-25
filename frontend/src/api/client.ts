// ─────────────────────────────────────────────────────────────
// api/client.ts
// Gazi SFT Portal — Merkezi API İstemcisi
// Tüm backend çağrıları buradan yönetilir.
// ─────────────────────────────────────────────────────────────

import axios from 'axios';
import type { CohortResponse, CurvesResponse, FilterState, UploadResponse } from '../types';

// Vite proxy sayesinde /api istekleri localhost:8000'e yönlendirilir
const api = axios.create({
  baseURL: '/',
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Hata normalleştirme ─────────────────────────────────────
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
  }
}

function handleError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const status  = err.response?.status ?? 0;
    const detail  = err.response?.data?.detail ?? err.message ?? 'Bilinmeyen hata';
    throw new ApiError(status, String(detail));
  }
  throw err;
}

// ─── Filtre → Query String dönüştürücü ──────────────────────
function buildParams(f: Partial<FilterState>): Record<string, string | number | boolean> {
  const p: Record<string, string | number | boolean> = {};
  if (f.min_age !== '' && f.min_age !== undefined && f.min_age !== null) p.min_age = f.min_age;
  if (f.max_age !== '' && f.max_age !== undefined && f.max_age !== null) p.max_age = f.max_age;
  if (f.gender)          p.gender          = f.gender;
  if (f.min_fev1_pred !== '' && f.min_fev1_pred !== undefined && f.min_fev1_pred !== null)
    p.min_fev1_pred = f.min_fev1_pred;
  if (f.max_fev1_pred !== '' && f.max_fev1_pred !== undefined && f.max_fev1_pred !== null)
    p.max_fev1_pred = f.max_fev1_pred;
  if (f.min_fvc_pred !== '' && f.min_fvc_pred !== undefined && f.min_fvc_pred !== null)
    p.min_fvc_pred = f.min_fvc_pred;
  if (f.max_fvc_pred !== '' && f.max_fvc_pred !== undefined && f.max_fvc_pred !== null)
    p.max_fvc_pred = f.max_fvc_pred;
  if (f.reversibility_positive !== null && f.reversibility_positive !== undefined)
    p.reversibility_positive = f.reversibility_positive;
  if (f.level_type) p.level_type = f.level_type;
  return p;
}

// ─── Kohort Sorgulama ────────────────────────────────────────
export async function fetchCohort(
  filters: Partial<FilterState>,
  limit = 500,
  offset = 0,
): Promise<CohortResponse> {
  try {
    const { data } = await api.get<CohortResponse>('/api/cohort', {
      params: { ...buildParams(filters), limit, offset },
    });
    return data;
  } catch (e) {
    return handleError(e);
  }
}

// ─── Eğri Verisi ─────────────────────────────────────────────
export async function fetchCurves(
  trialId: number,
  scope: 'REPORT' | 'RAW' | 'ALL' = 'REPORT',
): Promise<CurvesResponse> {
  try {
    const { data } = await api.get<CurvesResponse>(`/api/curves/${trialId}`, {
      params: { scope },
    });
    return data;
  } catch (e) {
    return handleError(e);
  }
}

// ─── Excel İndirme ───────────────────────────────────────────
export function buildExportUrl(filters: Partial<FilterState>): string {
  const params = new URLSearchParams();
  const p = buildParams(filters);
  Object.entries(p).forEach(([k, v]) => params.set(k, String(v)));
  return `/api/cohort/export?${params.toString()}`;
}

// ─── XML Yükleme ─────────────────────────────────────────────
export async function uploadXmlFiles(files: File[]): Promise<UploadResponse> {
  try {
    const form = new FormData();
    files.forEach((f) => form.append('files', f, f.name));
    const { data } = await api.post<UploadResponse>('/api/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120_000,  // Çoklu dosya için uzun timeout
    });
    return data;
  } catch (e) {
    return handleError(e);
  }
}

// ─── Sağlık Kontrolü ─────────────────────────────────────────
export async function fetchHealth(): Promise<{ status: string; database: { connected: boolean } }> {
  try {
    const { data } = await api.get('/health');
    return data;
  } catch {
    return { status: 'unreachable', database: { connected: false } };
  }
}
