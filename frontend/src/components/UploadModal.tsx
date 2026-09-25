// ─────────────────────────────────────────────────────────────
// components/UploadModal.tsx
// Drag & Drop XML yükleme modalı — SHA-256 dedup sonuç özeti
// ─────────────────────────────────────────────────────────────

import {
  CheckCircle, FileX, SkipForward, Upload, X, XCircle,
} from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { uploadXmlFiles } from '../api/client';
import type { UploadResponse, UploadResult } from '../types';

interface UploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type UIStatus = 'idle' | 'uploading' | 'done' | 'error';

const StatusIcon = ({ status }: { status: UploadResult['status'] }) => {
  switch (status) {
    case 'SUCCESS':          return <CheckCircle  className="w-4 h-4 text-emerald-500" />;
    case 'SKIPPED_DUPLICATE': return <SkipForward  className="w-4 h-4 text-amber-400" />;
    case 'FAILED_QUARANTINE': return <XCircle      className="w-4 h-4 text-red-500" />;
    default:                 return <FileX         className="w-4 h-4 text-gray-400" />;
  }
};

const statusLabel: Record<UploadResult['status'], string> = {
  SUCCESS:           'Yüklendi',
  SKIPPED_DUPLICATE: 'Mükerrer (Atlandı)',
  FAILED_QUARANTINE: 'Hata (Karantina)',
  PENDING:           'Beklemede',
};

export function UploadModal({ onClose, onSuccess }: UploadModalProps) {
  const [files, setFiles]         = useState<File[]>([]);
  const [uiStatus, setUiStatus]   = useState<UIStatus>('idle');
  const [response, setResponse]   = useState<UploadResponse | null>(null);
  const [errorMsg, setErrorMsg]   = useState<string | null>(null);
  const [isDragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Dosya seçimi ─────────────────────────────────────────
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

  // ─── Drag & Drop ──────────────────────────────────────────
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  // ─── Yükleme ──────────────────────────────────────────────
  const handleUpload = async () => {
    if (!files.length) return;
    setUiStatus('uploading');
    setErrorMsg(null);
    try {
      const res = await uploadXmlFiles(files);
      setResponse(res);
      setUiStatus('done');
      if (res.success > 0) {
        setTimeout(() => onSuccess(), 800); // Kohort tablosunu yenile
      }
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Yükleme sırasında bir hata oluştu.');
      setUiStatus('error');
    }
  };

  const handleClose = () => {
    if (uiStatus === 'uploading') return;
    onClose();
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gazi-navyDark/60
                 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="card w-full max-w-lg mx-4 flex flex-col shadow-cardLg animate-slide-up">

        {/* Modal başlık */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-clinical-border">
          <Upload className="w-4 h-4 text-gazi-navy" />
          <h2 className="text-sm font-semibold text-gazi-navy flex-1">
            Vyaire XML Dosyası Yükle
          </h2>
          <button
            onClick={handleClose}
            disabled={uiStatus === 'uploading'}
            className="btn-ghost p-1.5 rounded-md -mr-1.5 disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* ─── Drop Zone ─── */}
          {uiStatus !== 'done' && (
            <div
              className={`drop-zone cursor-pointer ${isDragOver ? 'active' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
            >
              <div className="w-12 h-12 rounded-full bg-gazi-navy/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-gazi-navy" />
              </div>
              <div>
                <p className="text-sm font-medium text-clinical-textPrimary">
                  Dosyaları buraya sürükleyin
                </p>
                <p className="text-xs text-clinical-textMuted mt-0.5">
                  veya tıklayarak seçin
                  <span className="ml-1 text-gazi-navy font-medium">(.xml)</span>
                </p>
              </div>
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

          {/* ─── Seçili Dosyalar Listesi ─── */}
          {files.length > 0 && uiStatus !== 'done' && (
            <div className="space-y-1.5">
              <p className="section-label">Seçili Dosyalar ({files.length})</p>
              <div className="max-h-36 overflow-y-auto space-y-1">
                {files.map(f => (
                  <div
                    key={f.name}
                    className="flex items-center gap-2 bg-clinical-bg rounded-md
                               px-2.5 py-1.5 border border-clinical-border/60"
                  >
                    <span className="font-mono text-xs text-clinical-textPrimary flex-1 truncate">
                      {f.name}
                    </span>
                    <span className="text-xs text-clinical-textMuted flex-shrink-0">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      onClick={() => removeFile(f.name)}
                      className="text-clinical-textMuted hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Yükleme Sonuçları ─── */}
          {uiStatus === 'done' && response && (
            <div className="space-y-3 animate-fade-in">
              {/* Özet satır */}
              <div className="flex gap-3">
                {[
                  { icon: CheckCircle, color: 'text-emerald-600', label: 'Başarılı', count: response.success },
                  { icon: SkipForward, color: 'text-amber-500', label: 'Mükerrer', count: response.skipped_duplicates },
                  { icon: XCircle,     color: 'text-red-500',    label: 'Hatalı',   count: response.failed },
                ].map(({ icon: Icon, color, label, count }) => (
                  <div key={label} className="flex-1 bg-clinical-bg rounded-lg p-3 text-center
                                               border border-clinical-border/60">
                    <Icon className={`w-5 h-5 ${color} mx-auto mb-1`} />
                    <p className={`text-lg font-bold ${color}`}>{count}</p>
                    <p className="text-xs text-clinical-textMuted">{label}</p>
                  </div>
                ))}
              </div>

              {/* Detay listesi */}
              <div className="max-h-40 overflow-y-auto space-y-1">
                {response.results.map((r) => (
                  <div
                    key={r.filename}
                    className="flex items-center gap-2 text-xs bg-clinical-bg
                               rounded-md px-2.5 py-1.5 border border-clinical-border/60"
                  >
                    <StatusIcon status={r.status} />
                    <span className="font-mono text-clinical-textPrimary flex-1 truncate">
                      {r.filename}
                    </span>
                    <span className="text-clinical-textMuted flex-shrink-0">
                      {statusLabel[r.status]}
                    </span>
                    {r.error_message && (
                      <span className="text-red-500 truncate max-w-[120px]" title={r.error_message}>
                        {r.error_message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Hata Mesajı ─── */}
          {uiStatus === 'error' && errorMsg && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
              <span className="font-medium">Hata: </span>{errorMsg}
            </div>
          )}
        </div>

        {/* ─── Alt Butonlar ─── */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-clinical-border">
          <button
            onClick={handleClose}
            disabled={uiStatus === 'uploading'}
            className="btn-secondary"
          >
            {uiStatus === 'done' ? 'Kapat' : 'İptal'}
          </button>
          {uiStatus !== 'done' && (
            <button
              onClick={handleUpload}
              disabled={!files.length || uiStatus === 'uploading'}
              className="btn-primary"
            >
              {uiStatus === 'uploading' ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  Yükleniyor…
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Yükle ({files.length} dosya)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
