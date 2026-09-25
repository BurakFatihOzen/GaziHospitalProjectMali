// ─────────────────────────────────────────────────────────────
// components/Header.tsx
// Üst gezinti çubuğu — Logo, başlık, eylem butonları, durum göstergesi
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';
import { Activity, Download, Upload, Wifi, WifiOff } from 'lucide-react';
import { fetchHealth } from '../api/client';
import type { FilterState } from '../types';
import { buildExportUrl } from '../api/client';

interface HeaderProps {
  onUploadClick: () => void;
  filters: FilterState;
  cohortTotal: number | null;
}

export function Header({ onUploadClick, filters, cohortTotal }: HeaderProps) {
  const [dbOnline, setDbOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const h = await fetchHealth();
      if (active) setDbOnline(h.database.connected);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { active = false; clearInterval(id); };
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
    <header className="bg-gazi-navy shadow-header z-30 flex-shrink-0">
      <div className="flex items-center h-14 px-4 gap-4">

        {/* Logo + Başlık */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-gazi-gold" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm leading-tight truncate">
              Gazi Üniversitesi Tıp Fakültesi
            </div>
            <div className="text-white/60 text-xs leading-tight truncate">
              Çocuk Alerji Birimi — SFT Analiz Portalı
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Kohort özet rozeti */}
        {cohortTotal !== null && (
          <div className="hidden sm:flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <span className="text-gazi-gold font-semibold text-sm">{cohortTotal}</span>
            <span className="text-white/70 text-xs">kayıt</span>
          </div>
        )}

        {/* DB Durum */}
        <div className="hidden sm:flex items-center gap-1.5">
          {dbOnline === null ? (
            <div className="spinner" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: '#C5A059' }} />
          ) : dbOnline ? (
            <div className="flex items-center gap-1 text-xs text-emerald-300">
              <Wifi className="w-3.5 h-3.5" />
              <span>Bağlı</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-red-300">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Bağlantı yok</span>
            </div>
          )}
        </div>

        {/* Ayırıcı */}
        <div className="hidden sm:block h-5 w-px bg-white/20" />

        {/* Eylem Butonları */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/20
                       px-3 py-1.5 text-sm font-medium text-white transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel İndir</span>
          </button>

          <button
            onClick={onUploadClick}
            className="inline-flex items-center gap-1.5 rounded-md bg-gazi-gold hover:bg-gazi-goldLight
                       px-3 py-1.5 text-sm font-semibold text-gazi-navyDark transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">XML Yükle</span>
          </button>
        </div>
      </div>
    </header>
  );
}
