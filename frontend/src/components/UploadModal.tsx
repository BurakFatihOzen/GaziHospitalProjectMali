// ─────────────────────────────────────────────────────────────
// components/UploadModal.tsx
// Gazi HBYS Vyaire SFT XML Dosya Yükleme & Ingestion Penceresi
// (Screenshot 3 & 4 referanslı HBYS dialog penceresi)
// ─────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import {
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  XCircle,
  FileCode,
  Check,
} from 'lucide-react';
import { uploadXmlFiles } from '../api/client';
import type { UploadResponse, UploadResult } from '../types';

interface UploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type UIStatus = 'idle' | 'uploading' | 'done' | 'error';

const StatusIcon = ({ status }: { status: UploadResult['status'] }) => {
  switch (status) {
    case 'SUCCESS':
      return <CheckCircle2 className="w-3.5 h-3.5 text-[#147530]" />;
    case 'SKIPPED_DUPLICATE':
      return <SkipForward className="w-3.5 h-3.5 text-[#B87B00]" />;
    case 'FAILED_QUARANTINE':
      return <XCircle className="w-3.5 h-3.5 text-[#BD362F]" />;
    default:
      return <AlertCircle className="w-3.5 h-3.5 text-gray-400" />;
  }
};

const statusLabel: Record<UploadResult['status'], string> = {
  SUCCESS: 'Başarılı (DB Kayıt)',
  SKIPPED_DUPLICATE: 'Mükerrer (SHA-256 İle Atlandı)',
  FAILED_QUARANTINE: 'Hata (Karantinaya Alındı)',
  PENDING: 'Beklemede',
};

export function UploadModal({ onClose, onSuccess }: UploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [uiStatus, setUiStatus] = useState<UIStatus>('idle');
  const [response, setResponse] = useState<UploadResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const xmls = Array.from(incoming).filter(f => f.name.toLowerCase().endsWith('.xml'));
    if (xmls.length === 0) return;
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...xmls.filter(f => !names.has(f.name))];
    });
    setUiStatus('idle');
    setResponse(null);
    setErrorMsg(null);
  }, []);

  const removeFile = (name: string) => setFiles(f => f.filter(x => x.name !== name));

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!files.length) return;
    setUiStatus('uploading');
    setErrorMsg(null);
    try {
      const res = await uploadXmlFiles(files);
      setResponse(res);
      setUiStatus('done');
      if (res.success > 0) {
        setTimeout(() => onSuccess(), 800);
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Yükleme sırasında hata meydana geldi.');
      setUiStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] select-none"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[520px] bg-white border border-[#527EA7] rounded shadow-2xl flex flex-col overflow-hidden animate-slide-up">
        {/* ─── Pencere Başlığı ─── */}
        <div className="hbys-window-titlebar h-7 px-2.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-[#D8E6F5]" />
            <span className="font-bold text-xs">
              Vyaire Medical SFT XML Dosyası İçe Aktarma (Ingestion)
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 rounded hover:bg-[#D32F2F] flex items-center justify-center text-white/90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* ─── İçerik Alanı ─── */}
        <div className="p-3 bg-[#F4F8FC] space-y-2 text-xs">
          {/* Bilgi Kutusu */}
          <div className="p-2 rounded bg-[#EAF2FA] border border-[#A7C5E2] text-[11px] text-[#194067] leading-snug">
            <strong>Gazi HBYS & SFT Entegrasyonu:</strong> Vyaire MasterScreen / Jaeger / Vyntus serisi cihazlardan
            alınan <span className="font-mono text-[#0E355E] font-bold">NIOSH_XmlExport.V3.0</span> formatındaki
            dosyaları seçin. Sistem SHA-256 kontrolü ile mükerrer kayıtları engeller.
          </div>

          {/* Sürükle Bırak Alanı */}
          {uiStatus !== 'done' && (
            <div
              className={`border-2 border-dashed rounded p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
                isDragOver ? 'border-[#0B4078] bg-[#DDEAF8]' : 'border-[#94B5D6] bg-white hover:bg-[#F0F6FD]'
              }`}
              onClick={() => inputRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <FileCode className="w-8 h-8 text-[#1A5794] mb-1.5" />
              <p className="font-semibold text-xs text-[#0D335A]">
                XML Dosyalarını Buraya Sürükleyin
              </p>
              <p className="text-[10px] text-[#55789B] mt-0.5">
                veya bilgisayarınızdan seçmek için tıklayın (.xml)
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xml"
                multiple
                className="hidden"
                onChange={e => addFiles(e.target.files)}
              />
            </div>
          )}

          {/* Seçili Dosyalar Listesi */}
          {files.length > 0 && uiStatus !== 'done' && (
            <fieldset className="hbys-groupbox bg-white">
              <legend className="hbys-legend">
                Aktarılacak Dosyalar ({files.length})
              </legend>
              <div className="max-h-32 overflow-y-auto space-y-1 p-1">
                {files.map(f => (
                  <div
                    key={f.name}
                    className="flex items-center justify-between px-2 py-1 rounded bg-[#F1F6FB] border border-[#D0DFEE] text-[11px]"
                  >
                    <span className="font-mono text-[#113860] truncate max-w-[340px]">
                      {f.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#5E7E9E]">
                        {(f.size / 1024).toFixed(0)} KB
                      </span>
                      <button
                        onClick={() => removeFile(f.name)}
                        className="text-[#BD362F] hover:text-[#E02020]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          {/* Yükleme Sonuçları Özeti */}
          {uiStatus === 'done' && response && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded bg-[#E4F5E8] border border-[#9BD9AA] text-center">
                  <div className="text-[10px] text-[#126830] font-semibold">Yeni Eklenen</div>
                  <div className="text-base font-bold text-[#126830]">{response.success}</div>
                </div>
                <div className="p-2 rounded bg-[#FFF7E6] border border-[#FCD680] text-center">
                  <div className="text-[10px] text-[#A66C00] font-semibold">Mükerrer Atlanan</div>
                  <div className="text-base font-bold text-[#A66C00]">
                    {response.skipped_duplicates}
                  </div>
                </div>
                <div className="p-2 rounded bg-[#FDE8E8] border border-[#F5A3A3] text-center">
                  <div className="text-[10px] text-[#BD362F] font-semibold">Hatalı / Karantina</div>
                  <div className="text-base font-bold text-[#BD362F]">{response.failed}</div>
                </div>
              </div>

              {/* Detay Listesi */}
              <div className="max-h-36 overflow-y-auto space-y-1 p-1 bg-white border border-[#CAD8E6] rounded">
                {response.results.map(r => (
                  <div
                    key={r.filename}
                    className="flex items-center gap-1.5 px-2 py-1 text-[11px] border-b border-[#F0F4F8] last:border-none"
                  >
                    <StatusIcon status={r.status} />
                    <span className="font-mono text-[#0F355D] truncate flex-1">
                      {r.filename}
                    </span>
                    <span className="text-[10px] text-[#4F6C8A]">
                      {statusLabel[r.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hata Mesajı */}
          {uiStatus === 'error' && errorMsg && (
            <div className="p-2 rounded bg-[#FDE8E8] border border-[#F5A3A3] text-[11px] text-[#BD362F]">
              <strong>Hata:</strong> {errorMsg}
            </div>
          )}
        </div>

        {/* ─── Alt Butonlar Çubuğu ─── */}
        <div className="h-10 px-3 bg-[#E4EEF8] border-t border-[#A8C2DC] flex items-center justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            disabled={uiStatus === 'uploading'}
            className="hbys-btn"
          >
            {uiStatus === 'done' ? 'Kapat' : 'İptal'}
          </button>

          {uiStatus !== 'done' && (
            <button
              onClick={handleUpload}
              disabled={!files.length || uiStatus === 'uploading'}
              className="hbys-btn hbys-btn-primary"
            >
              {uiStatus === 'uploading' ? (
                <>
                  <span className="spinner" style={{ width: 12, height: 12, borderColor: '#FFF', borderTopColor: '#C5A059' }} />
                  <span>İşleniyor…</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Veritabanına Aktar ({files.length})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
