import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, TriangleAlert } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title?: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon. */
  danger?: boolean;
  icon?: ReactNode;
}

export interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Shows a spinner on the confirm button. */
  loading?: boolean;
}

/** Controlled confirmation dialog. Prefer useConfirm() for one-off questions. */
export function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  loading = false,
  title = '¿Estás seguro?',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  icon,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      layer="dialog"
      hideClose
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4 py-1">
        <div
          className={
            danger
              ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blood-500/50 bg-blood-500/15 text-blood-400'
              : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold-600/50 bg-gold-500/10 text-gold-300'
          }
        >
          {icon ?? (danger ? <TriangleAlert className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />)}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="font-display text-base font-semibold text-parchment-50">{title}</h3>
          {message && <div className="mt-1.5 text-sm leading-relaxed text-parchment-300">{message}</div>}
        </div>
      </div>
    </Modal>
  );
}

type ConfirmFn = (options?: ConfirmOptions | string) => Promise<boolean>;

interface PendingConfirm {
  id: number;
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

let globalConfirm: ConfirmFn | null = null;
let confirmSeq = 0;

/** Mount once near the root. Enables useConfirm() and askConfirm(). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const confirm = useCallback<ConfirmFn>((options) => {
    const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options ?? {};
    return new Promise<boolean>((resolve) => {
      confirmSeq += 1;
      const id = confirmSeq;
      setQueue((q) => [...q, { id, options: opts, resolve }]);
    });
  }, []);

  useEffect(() => {
    globalConfirm = confirm;
    return () => {
      if (globalConfirm === confirm) globalConfirm = null;
      // Resolve anything still pending so callers never hang.
      for (const p of queueRef.current) p.resolve(false);
    };
  }, [confirm]);

  const current = queue[0] ?? null;
  const settle = (value: boolean) => {
    if (!current) return;
    current.resolve(value);
    setQueue((q) => q.slice(1));
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current && (
        <ConfirmDialog
          key={current.id}
          open
          {...current.options}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns confirm(options) → Promise<boolean>. Requires <ConfirmProvider>. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm requiere <ConfirmProvider>');
  return ctx;
}

/** Imperative variant for non-React code (stores). Resolves false when no provider is mounted. */
export function askConfirm(options?: ConfirmOptions | string): Promise<boolean> {
  return globalConfirm ? globalConfirm(options) : Promise.resolve(false);
}
