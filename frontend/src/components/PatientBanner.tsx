// ─────────────────────────────────────────────────────────────
// components/PatientBanner.tsx
// Gazi HBYS Hasta Künye Bandı (Screenshot 1 & 2 referanslı)
// ─────────────────────────────────────────────────────────────

import { Info, ShieldCheck, CheckSquare, Square } from 'lucide-react';
import type { CohortPatient, HbysSubTab } from '../types';
import { formatGender, formatName } from '../types';

interface PatientBannerProps {
  patient: CohortPatient | null;
  activeSubTab: HbysSubTab;
  onSubTabChange: (tab: HbysSubTab) => void;
  showOnlyOpen: boolean;
  onToggleOnlyOpen: () => void;
}

export function PatientBanner({
  patient,
  activeSubTab,
  onSubTabChange,
  showOnlyOpen,
  onToggleOnlyOpen,
}: PatientBannerProps) {
  // Varsayılan ya da seçili hasta bilgisi
  const name = patient ? formatName(patient).toUpperCase() : 'DENEME HASTASI';
  const genderCode = patient?.biological_gender?.toLowerCase().startsWith('m') ? 'E' : 'K';
  const externalId = patient?.external_id || '7500607';
  const tcNo = patient ? `284910${String(patient.patient_id).padStart(5, '0')}` : '12345678901';
  const ageDisplay = patient?.age ? `${patient.age} yıl` : '12 yıl';
  const birthDisplay = patient?.birth_date
    ? new Date(patient.birth_date).toLocaleDateString('tr-TR')
    : '14/05/2012';
  const heightDisplay = patient?.height_m ? `${(patient.height_m * 100).toFixed(0)} cm` : '142 cm';
  const weightDisplay = patient?.weight_kg ? `${patient.weight_kg} kg` : '38 kg';
  const predModule = patient?.prediction_module || 'GLI 2012 (Global Lung Function)';

  return (
    <div className="flex flex-col border-b border-[#96B5D4] bg-[#EDF3FA] flex-shrink-0">
      {/* ─── Hasta Künye Bandı (Üst Satır) ─── */}
      <div className="hbys-kunye-band px-3 py-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mavi Hasta Sıra / Dosya Kutu Rozeti */}
          <div className="px-2 py-0.5 rounded bg-[#18487A] text-white font-mono font-bold text-xs shadow-sm border border-[#0E3157] flex-shrink-0">
            {externalId}
          </div>

          {/* Mavi Bilgi (i) İkonu */}
          <div className="w-5 h-5 rounded-full bg-[#2068BA] text-white flex items-center justify-center flex-shrink-0 shadow-sm" title="Hasta Detay Bilgisi">
            <Info className="w-3.5 h-3.5" />
          </div>

          {/* Hasta Adı & Detay Satırı */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[13px] text-[#0A294C] tracking-wide truncate">
                {name} - ({genderCode})
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#D3E5F8] text-[#124278] border border-[#A5C7EC] font-semibold">
                Çocuk Alerji & Astım Polikliniği
              </span>
            </div>

            <div className="text-[11px] text-[#28496C] flex items-center gap-2 flex-wrap font-medium leading-tight mt-0.5">
              <span>
                <strong className="text-[#133253]">Yaş:</strong> {birthDisplay} - {ageDisplay}
              </span>
              <span className="text-[#96B3CE]">|</span>
              <span>
                <strong className="text-[#133253]">Dosya No:</strong> {externalId}
              </span>
              <span className="text-[#96B3CE]">|</span>
              <span>
                <strong className="text-[#133253]">TC Kimlik No:</strong> {tcNo}
              </span>
              <span className="text-[#96B3CE]">|</span>
              <span>
                <strong className="text-[#133253]">Boy / Kilo:</strong> {heightDisplay} / {weightDisplay}
              </span>
              <span className="text-[#96B3CE]">|</span>
              <span>
                <strong className="text-[#133253]">Referans Modül:</strong> {predModule}
              </span>
            </div>
          </div>
        </div>

        {/* Sağ Taraf: İletişim Onayı & Gazi Hastanesi Amblemi */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#147530] bg-[#E2F5E7] px-2 py-1 rounded border border-[#A8DEB6]">
            <ShieldCheck className="w-4 h-4 text-[#1E8E3E]" />
            <span>İletişim Onayı Var</span>
          </div>

          {/* Gazi Üniversitesi Tıp Fakültesi Hastanesi Logosu */}
          <div className="w-8 h-8 rounded-full border border-[#B02A37] bg-white flex items-center justify-center p-0.5 shadow-sm" title="Gazi Üniversitesi Sağlık Araştırma ve Uygulama Merkezi">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="48" fill="#B02A37" />
              <circle cx="50" cy="50" r="42" fill="#FFFFFF" />
              {/* Crescent & Star / Medical Caduceus emblem representation */}
              <circle cx="48" cy="50" r="28" fill="#B02A37" />
              <circle cx="55" cy="50" r="24" fill="#FFFFFF" />
              <polygon points="62,43 65,49 71,50 67,54 68,60 62,56 57,60 58,54 54,50 60,49" fill="#B02A37" />
            </svg>
          </div>
        </div>
      </div>

      {/* ─── Alt Sekmeler (Hasta Özet Bilgileri, Arşiv...) ─── */}
      <div className="flex items-center justify-between px-2 pt-1 border-t border-[#A8C2DC] bg-[#E3EDF7]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onSubTabChange('ozet')}
            className={`hbys-subtab ${activeSubTab === 'ozet' ? 'active' : ''}`}
          >
            Hasta Özet Bilgileri
          </button>
          <button
            onClick={() => onSubTabChange('sft_parametreleri')}
            className={`hbys-subtab ${activeSubTab === 'sft_parametreleri' ? 'active' : ''}`}
          >
            SFT Parametre & Kohort Listesi
          </button>
          <button
            onClick={() => onSubTabChange('arsiv_dosya')}
            className={`hbys-subtab ${activeSubTab === 'arsiv_dosya' ? 'active' : ''}`}
          >
            Arşiv Dosya Bilgileri
          </button>
          <button
            onClick={() => onSubTabChange('ileri_tarihli')}
            className={`hbys-subtab ${activeSubTab === 'ileri_tarihli' ? 'active' : ''}`}
          >
            İleri Tarihli Test / Tetkik Listesi
          </button>
          <button
            onClick={() => onSubTabChange('farkli_merkez')}
            className={`hbys-subtab ${activeSubTab === 'farkli_merkez' ? 'active' : ''}`}
          >
            Farklı Merkez İstekleri
          </button>
        </div>

        {/* Sağ Onay Kutuları */}
        <div className="flex items-center gap-3 text-xs text-[#203D5E] font-medium pr-1">
          <label className="flex items-center gap-1 cursor-pointer select-none" onClick={onToggleOnlyOpen}>
            {showOnlyOpen ? (
              <CheckSquare className="w-3.5 h-3.5 text-[#185392]" />
            ) : (
              <Square className="w-3.5 h-3.5 text-[#738FA8]" />
            )}
            <span>Sadece Açık Başvurular</span>
          </label>

          <label className="flex items-center gap-1 cursor-pointer select-none">
            <CheckSquare className="w-3.5 h-3.5 text-[#185392]" />
            <span>Tüm Merkezler</span>
          </label>
        </div>
      </div>
    </div>
  );
}
