import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { FileAudio, FileUp, Trash2, Upload } from 'lucide-react';
import { AUDIO_MIME_TYPES, MAX_UPLOAD_BYTES, type UploadResponse } from '@wailers/shared';
import { api } from '../../api/http';
import { formatBytes } from '../../lib/format';
import { Spinner } from './Spinner';
import { toast } from './toast';

export interface UploadCheck {
  /** Allowed MIME types (exact or prefix like "audio/"). Empty = anything. */
  mimeTypes?: string[];
  maxBytes?: number;
}

function mimeAllowed(file: File, mimeTypes: string[] | undefined): boolean {
  if (!mimeTypes || mimeTypes.length === 0) return true;
  const type = file.type.toLowerCase();
  return mimeTypes.some((m) => (m.endsWith('/') ? type.startsWith(m) : type === m.toLowerCase()));
}

/** Validates then uploads through api.uploads.upload. Throws Error with a Spanish message. */
export async function uploadFile(file: File, check: UploadCheck = {}): Promise<UploadResponse> {
  const maxBytes = check.maxBytes ?? MAX_UPLOAD_BYTES;
  if (!mimeAllowed(file, check.mimeTypes)) {
    throw new Error(`Formato no admitido: ${file.type || file.name}`);
  }
  if (file.size > maxBytes) {
    throw new Error(`El archivo es demasiado grande (${formatBytes(file.size)}; máximo ${formatBytes(maxBytes)})`);
  }
  return api.uploads.upload(file);
}

function fileNameFromUrl(url: string): string {
  try {
    const clean = url.split('?')[0] ?? url;
    return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1)) || url;
  } catch {
    return url;
  }
}

export interface FileUploadProps {
  /** Current file URL (or null). */
  value: string | null;
  /** Called with the uploaded URL (and server info), or null when cleared. */
  onChange: (url: string | null, info?: UploadResponse) => void;
  /** Native accept attribute, e.g. "audio/*". */
  accept?: string;
  /** MIME validation (defaults derived from accept: audio/* → AUDIO_MIME_TYPES). */
  mimeTypes?: string[];
  maxBytes?: number;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Custom preview of the current file. Default: audio player for audio, file name otherwise. */
  renderPreview?: (url: string) => ReactNode;
}

/** Generic file uploader (drag & drop or click). Used for audio files. */
export function FileUpload({
  value,
  onChange,
  accept,
  mimeTypes,
  maxBytes,
  label,
  hint,
  disabled,
  className,
  renderPreview,
}: FileUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [lastName, setLastName] = useState<string | null>(null);
  const isAudio = !!accept && accept.includes('audio');
  const types = mimeTypes ?? (isAudio ? AUDIO_MIME_TYPES : undefined);

  const handle = async (file: File | undefined) => {
    if (!file || disabled) return;
    setBusy(true);
    try {
      const res = await uploadFile(file, { mimeTypes: types, maxBytes });
      setLastName(res.originalName);
      onChange(res.url, res);
      toast.success('Archivo subido');
    } catch (err) {
      toast.fromError(err, 'No se pudo subir el archivo');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    void handle(e.dataTransfer.files?.[0]);
  };

  const preview = value
    ? renderPreview
      ? renderPreview(value)
      : isAudio
        ? <audio controls preload="none" src={value} className="h-9 w-full" />
        : null
    : null;

  return (
    <div className={clsx('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      {value ? (
        <div className="flex flex-col gap-2 rounded-lg border border-ink-500 bg-ink-950/60 p-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold-500/10 text-gold-300">
              {isAudio ? <FileAudio className="h-4 w-4" /> : <FileUp className="h-4 w-4" />}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-parchment-100" title={value}>
              {lastName ?? fileNameFromUrl(value)}
            </span>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              className="btn btn-ghost btn-sm"
            >
              {busy ? <Spinner size="xs" /> : <Upload className="h-3.5 w-3.5" />}
              Reemplazar
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => {
                setLastName(null);
                onChange(null);
              }}
              className="rounded-md p-1.5 text-parchment-400 transition hover:bg-blood-600/20 hover:text-blood-300"
              title="Quitar archivo"
              aria-label="Quitar archivo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {preview}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('Files')) {
              e.preventDefault();
              setOver(true);
            }
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-5 text-center transition',
            over ? 'border-gold-400 bg-gold-500/10' : 'border-ink-500 bg-ink-950/40 hover:border-gold-700 hover:bg-ink-800/60',
            disabled && 'pointer-events-none opacity-50',
          )}
        >
          {busy ? <Spinner size="md" label="Subiendo…" showLabel /> : (
            <>
              {isAudio ? <FileAudio className="h-6 w-6 text-gold-400" /> : <Upload className="h-6 w-6 text-gold-400" />}
              <span className="text-sm font-medium text-parchment-100">Arrastra un archivo o haz clic para elegirlo</span>
              <span className="text-xs text-parchment-400">{hint ?? `Máximo ${formatBytes(maxBytes ?? MAX_UPLOAD_BYTES)}`}</span>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => void handle(e.target.files?.[0])}
      />
    </div>
  );
}
