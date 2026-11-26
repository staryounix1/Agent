import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { STAGES, type Stage } from './types';

export type IconName =
  | 'layers'
  | 'script'
  | 'image'
  | 'film'
  | 'send'
  | 'plus'
  | 'play'
  | 'pause'
  | 'mic'
  | 'upload'
  | 'trash'
  | 'copy'
  | 'check'
  | 'download'
  | 'sparkles'
  | 'music'
  | 'close'
  | 'arrow'
  | 'chart'
  | 'share'
  | 'pencil'
  | 'volume'
  | 'refresh'
  | 'camera'
  | 'clock'
  | 'stop'
  | 'gear'
  | 'key'
  | 'info';

const PATHS: Record<IconName, string> = {
  layers: 'M12 3 3 8l9 5 9-5-9-5Z M3 13l9 5 9-5 M3 18l9 5 9-5',
  script: 'M14 3v5h5 M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z M8 13h8 M8 17h5',
  image: 'M3 5h18v14H3z M3 15l5-5 4 4 3-3 6 6',
  film: 'M3 4h18v16H3z M7 4v16 M17 4v16 M3 9h4 M3 15h4 M17 9h4 M17 15h4',
  send: 'M22 2 11 13 M22 2l-7 20-4-9-9-4 20-7Z',
  plus: 'M12 5v14 M5 12h14',
  play: 'M7 4v16l13-8-13-8Z',
  pause: 'M8 4v16 M16 4v16',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z M5 11a7 7 0 0 0 14 0 M12 18v3',
  upload: 'M12 16V4 M7 9l5-5 5 5 M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
  copy: 'M9 9h11v11H9z M4 4h11v3 M4 4v11h3',
  check: 'M20 6 9 17l-5-5',
  download: 'M12 4v12 M7 11l5 5 5-5 M4 20h16',
  sparkles: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z M19 15l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z',
  music: 'M9 18V6l10-2v12 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  close: 'M6 6l12 12 M18 6 6 18',
  arrow: 'M19 12H5 M12 19l-7-7 7-7',
  chart: 'M4 20V10 M10 20V4 M16 20v-7 M22 20H2',
  share: 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7 M12 15V3 M8 7l4-4 4 4',
  pencil: 'M4 20h4L20 8l-4-4L4 16v4Z M14 6l4 4',
  volume: 'M4 9v6h4l5 4V5L8 9H4Z M17 8a5 5 0 0 1 0 8 M19 5a9 9 0 0 1 0 14',
  refresh: 'M21 12a9 9 0 1 1-3-6.7 M21 3v6h-6',
  camera: 'M4 7h3l2-2h6l2 2h3v13H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2',
  stop: 'M6 6h12v12H6z',
  gear: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z',
  key: 'M15 7a4 4 0 1 1-3.9 5H9v3H6v3H2v-4l7.1-7.1A4 4 0 0 1 15 7Z M14.5 8.5h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v6 M12 7.5v.5',
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger';
  size?: 'md' | 'sm';
  icon?: IconName;
  block?: boolean;
};

export function Button({ variant = 'ghost', size = 'md', icon, block, children, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn--${variant} btn--${size} ${block ? 'btn--block' : ''} ${className}`}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 18} /> : null}
      {children ? <span>{children}</span> : null}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = 'quiet',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; variant?: 'quiet' | 'ghost' | 'danger' }) {
  return (
    <button type="button" className={`iconbtn iconbtn--${variant}`} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={18} />
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  id,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}

export function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label ?? 'التقدّم'}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Pipeline({ stage, onSelect }: { stage: Stage; onSelect?: (stage: Stage) => void }) {
  const activeIndex = STAGES.findIndex((s) => s.id === stage);
  return (
    <ol className="pipeline" aria-label="مراحل المشروع">
      {STAGES.map((s, i) => {
        const state = i < activeIndex ? 'done' : i === activeIndex ? 'current' : 'todo';
        return (
          <li key={s.id} className={`pipeline__step is-${state}`}>
            <button
              type="button"
              onClick={onSelect ? () => onSelect(s.id) : undefined}
              disabled={!onSelect}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span className="pipeline__dot">{state === 'done' ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className="pipeline__label">{s.short}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal__card ${wide ? 'modal__card--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <h2>{title}</h2>
          <IconButton icon="close" label="إغلاق" onClick={onClose} />
        </header>
        <div className="modal__body" ref={ref}>
          {children}
        </div>
        {footer ? <footer className="modal__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}

interface ToastItem {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}

const ToastContext = createContext<(message: string, tone?: 'ok' | 'error') => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    counter.current += 1;
    const id = counter.current;
    setItems((prev) => [...prev.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setItems((prev) => prev.filter((item) => item.id !== id)), 3200);
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {items.map((item) => (
          <div key={item.id} className={`toast toast--${item.tone}`}>
            <Icon name={item.tone === 'ok' ? 'check' : 'info'} size={16} />
            <span>{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty__icon">
        <Icon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
