import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { ImagePlus, Link2, Trash2, Upload } from 'lucide-react';
import { IMAGE_MIME_TYPES, MAX_UPLOAD_BYTES, type UploadResponse } from '@wailers/shared';
import { formatBytes } from '../../lib/format';
import { DND_ENTRY, hasDragType, readEntryDrag } from '../../lib/dnd';
import { uploadFile } from './FileUpload';
import { Spinner } from './Spinner';
import { toast } from './toast';

export interface ImageUploadProps {
  value: string | null;
  onChange: (url: string | null, info?: UploadResponse) => void;
  label?: ReactNode;
  hint?: ReactNode;
  /** Preview box shape. Default 'video' (16:9). */
  aspect?: 'square' | 'video' | 'portrait' | 'wide';
  /** Fixed preview height in px (overrides aspect). */
  height?: number;
  /** Allow pasting an image URL. Default true. */
  allowUrl?: boolean;
  /** How the preview fits: 'cover' (default) or 'contain' (maps). */
  fit?: 'cover' | 'contain';
  /** Round preview (portraits / tokens). */
  round?: boolean;
  disabled?: boolean;
  className?: string;
}

const ASPECT: Record<NonNullable<ImageUploadProps['aspect']>, string> = {
  square: 'aspect-square',
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  wide: 'aspect-[21/9]',
};

/** Image picker: drag & drop, click to browse, paste a URL, or drop a library entry with an image. */
export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  aspect = 'video',
  height,
  allowUrl = true,
  fit = 'cover',
  round = false,
  disabled = false,
  className,
}: ImageUploadProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [urlText, setUrlText] = useState('');
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [value]);

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    setBusy(true);
    try {
      const res = await uploadFile(file, { mimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_UPLOAD_BYTES });
      onChange(res.url, res);
    } catch (err) {
      toast.fromError(err, 'No se pudo subir la imagen');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const applyUrl = () => {
    const url = urlText.trim();
    if (!url) {
      setUrlMode(false);
      return;
    }
    if (!/^(https?:\/\/|\/|data:image\/)/i.test(url)) {
      toast.warning('La URL debe empezar por http://, https:// o /');
      return;
    }
    onChange(url);
    setUrlText('');
    setUrlMode(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleFile(file);
      return;
    }
    const entry = readEntryDrag(e);
    if (entry?.imageUrl) {
      onChange(entry.imageUrl);
      return;
    }
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri && /^https?:\/\//i.test(uri.trim())) onChange(uri.trim());
  };

  const sizeStyle = height ? { height } : undefined;
  const boxClass = clsx(
    'relative w-full overflow-hidden border transition',
    round ? 'rounded-full' : 'rounded-lg',
    !height && ASPECT[aspect],
  );

  return (
    <div className={clsx('min-w-0', className)}>
      {label && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <div
        onDragOver={(e) => {
          if (disabled) return;
          if (hasDragType(e, 'Files') || hasDragType(e, DND_ENTRY) || hasDragType(e, 'text/uri-list')) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {value && !busy ? (
          <div
            className={clsx(
              boxClass,
              'group border-ink-500 bg-[repeating-conic-gradient(#1c1915_0%_25%,#13110e_0%_50%)] bg-[length:16px_16px]',
              over && 'border-gold-400 ring-2 ring-gold-400/40',
            )}
            style={sizeStyle}
          >
            {broken ? (
              <div className="flex h-full w-full items-center justify-center p-3 text-center text-xs text-blood-300">
                No se pudo cargar la imagen
              </div>
            ) : (
              <img
                src={value}
                alt=""
                draggable={false}
                onError={() => setBroken(true)}
                className={clsx('h-full w-full', fit === 'cover' ? 'object-cover' : 'object-contain')}
              />
            )}
            <div className="absolute inset-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                disabled={disabled}
                onClick={() => inputRef.current?.click()}
                className="btn btn-secondary btn-sm"
                title="Cambiar imagen"
              >
                <Upload className="h-3.5 w-3.5" />
                Cambiar
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(null)}
                className="btn btn-danger btn-sm"
                title="Quitar imagen"
                aria-label="Quitar imagen"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled}
            onClick={() => !busy && !disabled && inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            style={sizeStyle}
            className={clsx(
              boxClass,
              'flex cursor-pointer flex-col items-center justify-center gap-1.5 border-2 border-dashed p-3 text-center',
              over ? 'border-gold-400 bg-gold-500/10' : 'border-ink-500 bg-ink-950/40 hover:border-gold-700 hover:bg-ink-800/60',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            {busy ? (
              <Spinner size="md" label="Subiendo imagen…" showLabel />
            ) : (
              <>
                <ImagePlus className="h-7 w-7 text-gold-400" />
                {!round && (
                  <>
                    <span className="text-sm font-medium text-parchment-100">Arrastra una imagen o haz clic</span>
                    <span className="text-xs text-parchment-400">{hint ?? `PNG, JPG, WEBP, GIF o SVG · máx. ${formatBytes(MAX_UPLOAD_BYTES)}`}</span>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {allowUrl && !disabled && (
        <div className="mt-1.5">
          {urlMode ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={urlText}
                onChange={(e) => setUrlText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyUrl();
                  } else if (e.key === 'Escape') {
                    e.stopPropagation();
                    setUrlMode(false);
                  }
                }}
                placeholder="https://…/imagen.png"
                aria-label="URL de la imagen"
                className="input input-sm flex-1"
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={applyUrl}>
                Usar
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-parchment-400 transition hover:text-gold-300"
              onClick={() => setUrlMode(true)}
            >
              <Link2 className="h-3 w-3" />
              Usar una URL
            </button>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={IMAGE_MIME_TYPES.join(',')}
        className="hidden"
        disabled={disabled}
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
