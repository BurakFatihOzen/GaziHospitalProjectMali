// ─────────────────────────────────────────────────────────────
// components/LeftSidebar.tsx
// Gazi HBYS "Çok Amaçlı Kullanıcı Asistanı" Sol Panel
// (Screenshot 1, 2, 3, 4 referanslı)
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Smartphone,
  Users,
  Star,
  AlertCircle,
  Layers,
  DollarSign,
  Building2,
  FileText,
  Activity,
  Calendar,
  UserCheck,
  Send,
  ClipboardList,
} from 'lucide-react';
import type { CohortPatient, RecentPatientItem } from '../types';

interface LeftSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  recentPatients: RecentPatientItem[];
  onSelectRecentPatient: (externalId: string) => void;
  onOpenUpload: () => void;
  onOpenReport: () => void;
  onShowCurveView: () => void;
  selectedPatient: CohortPatient | null;
}

export function LeftSidebar({
  collapsed,
  onToggleCollapse,
  recentPatients,
  onSelectRecentPatient,
  onOpenUpload,
  onOpenReport,
  onShowCurveView,
  selectedPatient,
}: LeftSidebarProps) {
  // Accordion durumları
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    recent: true,
    shortcuts: true,
    openScreens: true,
    consults: false,
    currency: false,
    gss: false,
  });

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  if (collapsed) {
    return (
      <div className="w-8 flex-shrink-0 bg-[#E0EBF5] border-r border-[#9BB6D1] flex flex-col items-center py-2 select-none">
        <button
          onClick={onToggleCollapse}
          className="p-1 hover:bg-[#C2D7EC] text-[#1E436D] rounded"
          title="Çok Amaçlı Kullanıcı Asistanını Genişlet"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-8 text-[11px] font-bold text-[#204975] tracking-widest [writing-mode:vertical-lr] rotate-180">
          KULLANICI ASİSTANI
        </div>
      </div>
    );
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-[#E6F0FA] border-r border-[#97B4D0] flex flex-col select-none overflow-hidden text-xs">
      {/* ─── Başlık Çubuğu ─── */}
      <div className="h-6 px-2 bg-gradient-to-b from-[#EDF4FB] to-[#D5E3F1] border-b border-[#A2BCD4] flex items-center justify-between font-bold text-[#143C66]">
        <span className="truncate">Çok Amaçlı Kullanıcı Asistanı</span>
        <button
          onClick={onToggleCollapse}
          className="p-0.5 hover:bg-[#BED5EB] rounded text-[#143C66]"
          title="Paneli Daralt"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
        {/* ─── Nucleus Mobil Banner ─── */}
        <div className="rounded border border-[#8FB1D4] bg-gradient-to-b from-[#FFFFFF] to-[#D2E4F8] p-2 flex items-center gap-2 shadow-sm cursor-pointer hover:border-[#5289C0]">
          <div className="w-7 h-7 rounded bg-[#185392] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-[#0E355E] text-[12px] leading-tight">Nucleus Mobil</div>
            <div className="text-[10px] text-[#426487]">Mobil Hekim Asistanı</div>
          </div>
        </div>

        {/* ─── Son Hastalarım ─── */}
        <div className="border border-[#9DBBD9] rounded bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div
            onClick={() => toggleSection('recent')}
            className="px-2 py-1 bg-gradient-to-b from-[#EAF2FA] to-[#D7E6F5] flex items-center justify-between cursor-pointer font-bold text-[#113C66] border-b border-[#BDD2E6]"
          >
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#1C5CA2]" />
              <span>Son Hastalarım</span>
            </div>
            {openSections.recent ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          {openSections.recent && (
            <div className="p-1 space-y-0.5 bg-[#FAFBFD]">
              {recentPatients.length === 0 ? (
                <div className="p-2 text-[10px] text-[#6988A6] italic text-center">
                  Henüz seçili hasta yok
                </div>
              ) : (
                recentPatients.map((rp) => (
                  <div
                    key={rp.external_id}
                    onClick={() => onSelectRecentPatient(rp.external_id)}
                    className={`px-1.5 py-1 rounded text-[11px] cursor-pointer flex items-center justify-between border transition-colors ${
                      selectedPatient?.external_id === rp.external_id
                        ? 'bg-[#CCE2F7] border-[#81A8CE] text-[#0A2E54] font-bold'
                        : 'bg-white border-[#E1EAF2] hover:bg-[#EEF5FC] text-[#224466]'
                    }`}
                  >
                    <div className="truncate min-w-0 pr-1">
                      <span className="font-mono text-[10px] text-[#145394] font-semibold mr-1">
                        {rp.external_id}
                      </span>
                      <span>{rp.name}</span>
                    </div>
                    {rp.age && (
                      <span className="text-[9px] text-[#5A7C9D] flex-shrink-0">{rp.age}y</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ─── Kısayollarım ─── */}
        <div className="border border-[#9DBBD9] rounded bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div
            onClick={() => toggleSection('shortcuts')}
            className="px-2 py-1 bg-gradient-to-b from-[#EAF2FA] to-[#D7E6F5] flex items-center justify-between cursor-pointer font-bold text-[#113C66] border-b border-[#BDD2E6]"
          >
            <div className="flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-[#D18F08]" />
              <span>Kısayollarım</span>
            </div>
            {openSections.shortcuts ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          {openSections.shortcuts && (
            <div className="p-1 space-y-0.5 text-[11px] bg-[#FAFBFD]">
              <button
                onClick={onShowCurveView}
                className="w-full text-left px-2 py-1 hover:bg-[#E8F2FB] text-[#1B436E] rounded flex items-center gap-1.5 font-medium"
              >
                <Activity className="w-3.5 h-3.5 text-[#165696]" />
                <span>Akış-Hacim Eğri Analizi</span>
              </button>
              <button
                onClick={onOpenReport}
                className="w-full text-left px-2 py-1 hover:bg-[#E8F2FB] text-[#1B436E] rounded flex items-center gap-1.5 font-medium"
              >
                <FileText className="w-3.5 h-3.5 text-[#165696]" />
                <span>SFT İlaç / Rapor Hazırlama</span>
              </button>
              <button
                onClick={onOpenUpload}
                className="w-full text-left px-2 py-1 hover:bg-[#E8F2FB] text-[#1B436E] rounded flex items-center gap-1.5 font-medium"
              >
                <Send className="w-3.5 h-3.5 text-[#165696]" />
                <span>Vyaire Cihazından İçe Aktar</span>
              </button>
              <div className="w-full text-left px-2 py-1 text-[#436486] rounded flex items-center gap-1.5 opacity-75">
                <ClipboardList className="w-3.5 h-3.5 text-[#165696]" />
                <span>ATS/ERS Pediatrik Kriterler</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Açık Ekranlar ─── */}
        <div className="border border-[#9DBBD9] rounded bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div
            onClick={() => toggleSection('openScreens')}
            className="px-2 py-1 bg-gradient-to-b from-[#EAF2FA] to-[#D7E6F5] flex items-center justify-between cursor-pointer font-bold text-[#113C66] border-b border-[#BDD2E6]"
          >
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#1D5E9F]" />
              <span>Açık Ekranlar</span>
            </div>
            {openSections.openScreens ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          {openSections.openScreens && (
            <div className="p-1 space-y-1 bg-[#FAFBFD] text-[11px]">
              <div className="px-2 py-1 rounded bg-[#E4EFF9] border border-[#A7C8E8] text-[#0D3660] font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#185392]" />
                <span className="truncate">Hasta Poliklinik İşlemleri</span>
              </div>
              {selectedPatient && (
                <div
                  onClick={onShowCurveView}
                  className="px-2 py-1 rounded bg-[#FCFDFE] hover:bg-[#EEF5FC] border border-[#D5E3EF] text-[#224870] font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-[#2E9E4C]" />
                  <span className="truncate">Akış-Hacim ({selectedPatient.external_id})</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Acil Konsültasyonlar ─── */}
        <div className="border border-[#9DBBD9] rounded bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div
            onClick={() => toggleSection('consults')}
            className="px-2 py-1 bg-gradient-to-b from-[#EAF2FA] to-[#D7E6F5] flex items-center justify-between cursor-pointer font-bold text-[#113C66] border-b border-[#BDD2E6]"
          >
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-[#BD362F]" />
              <span>Acil Konsültasyonlar</span>
            </div>
            {openSections.consults ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          {openSections.consults && (
            <div className="p-2 text-[10px] text-[#55789A] text-center bg-[#FAFBFD]">
              Takip edilen acil konsültasyon yok!
            </div>
          )}
        </div>

        {/* ─── Döviz Bilgileri ─── */}
        <div className="border border-[#9DBBD9] rounded bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div
            onClick={() => toggleSection('currency')}
            className="px-2 py-1 bg-gradient-to-b from-[#EAF2FA] to-[#D7E6F5] flex items-center justify-between cursor-pointer font-bold text-[#113C66] border-b border-[#BDD2E6]"
          >
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-[#1F7A3E]" />
              <span>Döviz Bilgileri</span>
            </div>
            {openSections.currency ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          {openSections.currency && (
            <div className="p-2 space-y-1 text-[11px] bg-[#FAFBFD] font-mono">
              <div className="flex justify-between">
                <span className="text-[#3F6285]">USD / TRY:</span>
                <span className="font-bold text-[#10345B]">34.18 ₺</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#3F6285]">EUR / TRY:</span>
                <span className="font-bold text-[#10345B]">37.84 ₺</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── GSS Tesis Bilgileri ─── */}
        <div className="border border-[#9DBBD9] rounded bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div
            onClick={() => toggleSection('gss')}
            className="px-2 py-1 bg-gradient-to-b from-[#EAF2FA] to-[#D7E6F5] flex items-center justify-between cursor-pointer font-bold text-[#113C66] border-b border-[#BDD2E6]"
          >
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-[#195593]" />
              <span>GSS Tesis Bilgileri</span>
            </div>
            {openSections.gss ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </div>

          {openSections.gss && (
            <div className="p-2 text-[10px] text-[#2F5275] bg-[#FAFBFD] leading-snug">
              <strong>Tesis Kodu:</strong> 10060001
              <br />
              <strong>Kurum:</strong> Gazi Üniversitesi Hastanesi
              <br />
              <strong>Birim:</strong> Çocuk Alerji Poliklinik
            </div>
          )}
        </div>
      </div>

      {/* ─── Alt Hızlı Menü (Hasta İşlemleri Dikey İkonlar) ─── */}
      <div className="p-1 border-t border-[#A4BDD5] bg-[#DEEAF5] grid grid-cols-4 gap-1">
        <button
          onClick={onOpenReport}
          className="p-1 rounded bg-white hover:bg-[#D5E6F7] border border-[#9BBBDC] flex flex-col items-center justify-center text-[9px] text-[#143B63] font-semibold shadow-sm"
          title="Hasta Raporu"
        >
          <FileText className="w-3.5 h-3.5 text-[#1C5996]" />
          <span>Rapor</span>
        </button>

        <button
          onClick={onShowCurveView}
          className="p-1 rounded bg-white hover:bg-[#D5E6F7] border border-[#9BBBDC] flex flex-col items-center justify-center text-[9px] text-[#143B63] font-semibold shadow-sm"
          title="Akış-Hacim Eğrisi"
        >
          <Activity className="w-3.5 h-3.5 text-[#1C5996]" />
          <span>Eğri</span>
        </button>

        <button
          onClick={onOpenUpload}
          className="p-1 rounded bg-white hover:bg-[#D5E6F7] border border-[#9BBBDC] flex flex-col items-center justify-center text-[9px] text-[#143B63] font-semibold shadow-sm"
          title="XML İçe Aktar"
        >
          <Send className="w-3.5 h-3.5 text-[#1C5996]" />
          <span>İçe Aktar</span>
        </button>

        <button
          className="p-1 rounded bg-white hover:bg-[#D5E6F7] border border-[#9BBBDC] flex flex-col items-center justify-center text-[9px] text-[#143B63] font-semibold shadow-sm"
          title="Hasta Bilgileri"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#1C5996]" />
          <span>Bilgi</span>
        </button>
      </div>
    </aside>
  );
}
