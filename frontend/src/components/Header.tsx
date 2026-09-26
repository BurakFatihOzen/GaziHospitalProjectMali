// ─────────────────────────────────────────────────────────────
// components/Header.tsx
// Gazi HBYS NUCLEUS v9.40.66 Üst Sistem Başlığı, Menü Çubuğu ve Araç Çubuğu
// (Screenshot 1, 2, 3, 4 referanslı)
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import {
  Activity,
  Download,
  Upload,
  Wifi,
  WifiOff,
  Printer,
  Save,
  Search,
  RefreshCw,
  FolderOpen,
  FileSpreadsheet,
  Settings,
  HelpCircle,
  Calculator,
  Minus,
  Square,
  X,
  FileText,
} from 'lucide-react';
import { fetchHealth, buildExportUrl } from '../api/client';
import type { FilterState } from '../types';

interface HeaderProps {
  onUploadClick: () => void;
  onRefreshClick: () => void;
  onReportClick: () => void;
  filters: FilterState;
  cohortTotal: number | null;
}

export function Header({
  onUploadClick,
  onRefreshClick,
  onReportClick,
  filters,
  cohortTotal,
}: HeaderProps) {
  const [dbOnline, setDbOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const h = await fetchHealth();
      if (active) setDbOnline(h.database.connected);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const handleExport = () => {
    const url = buildExportUrl(filters);
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <header className="flex-shrink-0 flex flex-col select-none border-b border-[#8FA8C4]">
      {/* ─── 1. En Üst Windows / HBYS Başlık Çubuğu ─── */}
      <div className="hbys-sys-titlebar h-7 px-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* Gazi Hastanesi Kırmızı İkon */}
          <div className="w-4 h-4 rounded-full bg-[#B02A37] border border-white flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-bold text-white leading-none">G</span>
          </div>

          <span className="text-[12px] font-medium tracking-wide truncate">
            NUCLEUS v9.40.66 - Gazi Üniversitesi Sağlık Araştırma ve Uygulama Merkezi [Hastane]
          </span>
        </div>

        {/* Windows Pencere Kontrolleri */}
        <div className="flex items-center">
          <button
            className="w-7 h-5 flex items-center justify-center hover:bg-white/20 text-white/80 hover:text-white"
            title="Simge Durumuna Küçült"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            className="w-7 h-5 flex items-center justify-center hover:bg-white/20 text-white/80 hover:text-white"
            title="Ekranı Kapla"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            className="w-8 h-5 flex items-center justify-center hover:bg-[#D32F2F] text-white/80 hover:text-white"
            title="Kapat"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── 2. HBYS Ana Menü Çubuğu (Menu Bar) ─── */}
      <div className="hbys-menubar flex items-center px-1 overflow-x-auto">
        <div className="hbys-menu-item font-semibold">Genel</div>
        <div className="hbys-menu-item font-semibold">Hasta Kayıt / Randevu</div>
        <div className="hbys-menu-item font-semibold">Medikal Takip</div>
        <div className="hbys-menu-item font-semibold">Laboratuvar</div>
        <div className="hbys-menu-item font-semibold">Tetkik Sistemi</div>
        <div className="hbys-menu-item font-bold text-[#0B4078] bg-[#D4E5F7] border-b border-[#0B4078]">
          SFT / Solunum
        </div>
        <div className="hbys-menu-item font-semibold">Kan Bankası</div>
        <div className="hbys-menu-item font-semibold">Finans</div>
        <div className="hbys-menu-item font-semibold">Yatan Hasta</div>
        <div className="hbys-menu-item font-semibold">Stok / Satınalma</div>
        <div className="hbys-menu-item font-semibold">İnsan Kaynakları</div>
        <div className="hbys-menu-item font-semibold">İdari Modüller</div>
        <div className="hbys-menu-item font-semibold">Sistem Yönetimi</div>
      </div>

      {/* ─── 3. HBYS Araç Çubuğu (Quick Toolbar) ─── */}
      <div className="hbys-toolbar h-8 px-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onRefreshClick}
            className="hbys-tool-btn"
            title="Sayfayı ve Kohort Verilerini Yenile"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#14477D]" />
            <span>Yenile</span>
          </button>

          <button
            onClick={onUploadClick}
            className="hbys-tool-btn font-semibold text-[#0E3A68]"
            title="Vyaire Medical SFT XML Dosyası Yükle"
          >
            <Upload className="w-3.5 h-3.5 text-[#185FA5]" />
            <span>XML İçe Aktar</span>
          </button>

          <button
            onClick={handleExport}
            className="hbys-tool-btn"
            title="Mevcut Kohortu Excel Dosyası Olarak İndir"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#217346]" />
            <span>Excel Aktar</span>
          </button>

          <button
            onClick={onReportClick}
            className="hbys-tool-btn"
            title="Seçili Hasta İçin SFT Raporu Oluştur"
          >
            <FileText className="w-3.5 h-3.5 text-[#185FA5]" />
            <span>SFT Raporu</span>
          </button>

          <button
            onClick={() => window.print()}
            className="hbys-tool-btn"
            title="Klinik Görünümü Yazdır"
          >
            <Printer className="w-3.5 h-3.5 text-[#3C5775]" />
            <span>Yazdır</span>
          </button>

          <div className="h-4 w-px bg-[#B0C4D8] mx-1" />

          {/* Kohort Toplam Kayıt Rozeti */}
          {cohortTotal !== null && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#E4EEF8] border border-[#A7C2DC] text-[11px] font-medium text-[#113C68]">
              <span>Kohort:</span>
              <strong className="text-[#0E355E]">{cohortTotal}</strong>
              <span className="text-[#4F6C8A]">test</span>
            </div>
          )}
        </div>

        {/* Sağ Taraf: DB Durumu & Kullanıcı Birimi */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#F2F6FA] border border-[#B9CEDF]">
            {dbOnline === null ? (
              <div className="spinner" style={{ width: 12, height: 12 }} />
            ) : dbOnline ? (
              <div className="flex items-center gap-1 text-[11px] text-[#147530] font-semibold">
                <Wifi className="w-3 h-3 text-[#1C8A39]" />
                <span>DB: PostgreSQL 16 (Aktif)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-[11px] text-[#B02A37] font-semibold">
                <WifiOff className="w-3 h-3 text-[#B02A37]" />
                <span>DB: Bağlantı Yok</span>
              </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-1 text-[11px] text-[#294B6F] font-semibold px-2 py-0.5 rounded bg-[#E5EEF7] border border-[#ABC4DC]">
            <Activity className="w-3.5 h-3.5 text-[#003366]" />
            <span>Çocuk Göğüs Hastalıkları & Alerji BD</span>
          </div>
        </div>
      </div>
    </header>
  );
}
