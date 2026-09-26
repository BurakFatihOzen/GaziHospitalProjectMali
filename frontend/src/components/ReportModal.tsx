// ─────────────────────────────────────────────────────────────
// components/ReportModal.tsx
// Gazi HBYS Hasta SFT Raporu Hazırlama V2 Modalı
// (Screenshot 3 & 4 referanslı HBYS Rapor Hazırlama arayüzü)
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  FileText,
  X,
  Printer,
  Save,
  CheckCircle,
  Plus,
  Trash2,
  Stethoscope,
  Activity,
} from 'lucide-react';
import type { CohortPatient } from '../types';
import {
  fev1Severity,
  formatGender,
  formatName,
  formatNum,
  severityLabel,
} from '../types';

interface ReportModalProps {
  patient: CohortPatient | null;
  onClose: () => void;
}

export function ReportModal({ patient, onClose }: ReportModalProps) {
  const [reportDate] = useState(new Date().toLocaleDateString('tr-TR'));
  const [docNotes, setDocNotes] = useState(
    'Hastanın spirometrik ölçümlerinde FEV1/FVC oranı ve FEV1 değerleri incelendi. Pediatrik GLI-2012 referans normlarına göre değerlendirilmiş olup klinik izlem ve kontrol testi önerilir.'
  );
  const [saved, setSaved] = useState(false);

  const sev = fev1Severity(patient?.fev1_pred_percent ?? null);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] select-none"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[680px] bg-white border border-[#4B79A1] rounded shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* ─── Pencere Başlığı ─── */}
        <div className="hbys-window-titlebar h-7 px-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#D8E6F5]" />
            <span className="font-bold text-xs">
              Hasta SFT / Spirometri Medikal Rapor Hazırlama V2
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded hover:bg-[#D32F2F] flex items-center justify-center text-white/90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ─── Üst Form Bilgileri ─── */}
        <div className="p-3 bg-[#F4F8FC] border-b border-[#A6BED4] text-xs space-y-2">
          <div className="grid grid-cols-4 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-[#18395B] block">Rapor Tarihi</label>
              <input type="text" readOnly value={reportDate} className="hbys-input w-full bg-[#EBF2F9]" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#18395B] block">Protokol No</label>
              <input
                type="text"
                readOnly
                value={patient?.external_id ?? '7500607'}
                className="hbys-input w-full font-mono font-bold text-[#0D3660] bg-[#EBF2F9]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#18395B] block">Sayaç / Rapor No</label>
              <input type="text" readOnly value="SFT-2026/0491" className="hbys-input w-full bg-[#EBF2F9]" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#18395B] block">Düzenleme Türü</label>
              <select className="hbys-select w-full">
                <option>Tek Hekim</option>
                <option>Sağlık Kurulu</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <div>
              <label className="text-[10px] font-semibold text-[#18395B] block">Bölüm / Birim</label>
              <input
                type="text"
                readOnly
                value="Çocuk Alerji ve İmmünoloji Polikliniği"
                className="hbys-input w-full bg-[#EBF2F9]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-[#18395B] block">İsteyen Doktor</label>
              <input
                type="text"
                readOnly
                value="Prof. Dr. Gazi Çocuk Alerji"
                className="hbys-input w-full bg-[#EBF2F9]"
              />
            </div>
          </div>
        </div>

        {/* ─── Rapor Tanıları & Spirometri Parametreleri ─── */}
        <div className="p-3 bg-white space-y-3 flex-1 overflow-y-auto max-h-[380px] text-xs">
          {/* Tanı Listesi Tablosu */}
          <fieldset className="hbys-groupbox bg-[#FCFDFE]">
            <legend className="hbys-legend flex items-center gap-1">
              <Stethoscope className="w-3 h-3 text-[#14477D]" />
              <span>Rapor Tanıları</span>
            </legend>
            <table className="hbys-table mt-1">
              <thead>
                <tr>
                  <th className="hbys-th">Tanı Kodu</th>
                  <th className="hbys-th">Tipi</th>
                  <th className="hbys-th">Tanı Adı</th>
                  <th className="hbys-th">Durum</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hbys-tr">
                  <td className="hbys-td font-mono font-bold text-[#0D3660]">J45.0</td>
                  <td className="hbys-td">Kesin Tanı</td>
                  <td className="hbys-td">Alerjik Astım (Predominant Allergic Asthma)</td>
                  <td className="hbys-td">
                    <span className="badge badge-normal">Aktif</span>
                  </td>
                </tr>
                <tr className="hbys-tr">
                  <td className="hbys-td font-mono font-bold text-[#0D3660]">J30.1</td>
                  <td className="hbys-td">Ön Tanı</td>
                  <td className="hbys-td">Polene Bağlı Alerjik Rinit</td>
                  <td className="hbys-td">
                    <span className="badge badge-mild">İzlemde</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </fieldset>

          {/* SFT Ölçüm Özeti */}
          {patient && (
            <fieldset className="hbys-groupbox bg-[#FCFDFE]">
              <legend className="hbys-legend flex items-center gap-1">
                <Activity className="w-3 h-3 text-[#14477D]" />
                <span>SFT Spirometri Değerleri</span>
              </legend>
              <div className="grid grid-cols-4 gap-2 text-[11px] p-1 bg-[#F5F9FD] rounded border border-[#D5E3EF]">
                <div>
                  <span className="text-[#4E7092]">FEV₁:</span>{' '}
                  <strong>{formatNum(patient.fev1_val, 2)} L</strong>
                </div>
                <div>
                  <span className="text-[#4E7092]">FEV₁ %Pred:</span>{' '}
                  <strong>
                    {patient.fev1_pred_percent ? `%${patient.fev1_pred_percent.toFixed(0)}` : '—'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#4E7092]">FVC:</span>{' '}
                  <strong>{formatNum(patient.fvc_val, 2)} L</strong>
                </div>
                <div>
                  <span className="text-[#4E7092]">FEV₁/FVC:</span>{' '}
                  <strong>{formatNum(patient.fev1_fvc_ratio, 1)}%</strong>
                </div>
                <div>
                  <span className="text-[#4E7092]">Reversibilite:</span>{' '}
                  <strong className={patient.reversibility_positive ? 'text-[#126830]' : ''}>
                    {patient.reversibility_positive ? '✓ Pozitif' : 'Negatif'}
                  </strong>
                </div>
                <div>
                  <span className="text-[#4E7092]">Evre:</span>{' '}
                  <strong>{severityLabel(sev)} Obstrüksiyon</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-[#4E7092]">Pediatrik Modül:</span>{' '}
                  <strong>{patient.prediction_module ?? 'GLI-2012'}</strong>
                </div>
              </div>
            </fieldset>
          )}

          {/* Rapor Açıklaması */}
          <div>
            <label className="text-[11px] font-semibold text-[#18395B] block mb-1">
              Rapor Açıklamaları ve Klinik Karar:
            </label>
            <textarea
              rows={3}
              value={docNotes}
              onChange={e => setDocNotes(e.target.value)}
              className="hbys-input w-full font-sans text-xs resize-none"
            />
          </div>
        </div>

        {/* ─── Alt Butonlar ─── */}
        <div className="h-10 px-3 bg-[#E4EEF8] border-t border-[#A8C2DC] flex items-center justify-between flex-shrink-0">
          <div>
            {saved && (
              <span className="text-[11px] text-[#147530] font-bold flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Rapor Gazi HBYS sistemine kaydedildi.
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="hbys-btn">
              Kapat
            </button>
            <button onClick={handleSave} className="hbys-btn">
              <Save className="w-3.5 h-3.5 text-[#134C82]" />
              <span>Kaydet</span>
            </button>
            <button
              onClick={() => window.print()}
              className="hbys-btn hbys-btn-primary"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Raporu Bastır</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
