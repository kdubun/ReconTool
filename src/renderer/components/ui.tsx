import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { cx } from '@renderer/lib/cx';
import { nodeColor } from '@renderer/theme/nodeColors';

export const SearchIcon = ({ size = 13, stroke = 'currentColor' }: { size?: number; stroke?: string }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

export const RefreshIcon = ({ size = 12 }: { size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />
  </svg>
);

export const UploadIcon = ({ size = 20 }: { size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" />
  </svg>
);

export const AlertIcon = ({ size = 15, stroke = 'currentColor' }: { size?: number; stroke?: string }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5v.01" />
  </svg>
);

export const WarnIcon = ({ size = 15, stroke = 'currentColor' }: { size?: number; stroke?: string }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17.5v.01" />
  </svg>
);

export const CheckIcon = ({ size = 13, stroke = 'currentColor' }: { size?: number; stroke?: string }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export const ArrowRightIcon = ({ size = 12, stroke = '#334155' }: { size?: number; stroke?: string }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M4 12h14M13 7l5 5-5 5" />
  </svg>
);

export const Spinner = ({ size = 14 }: { size?: number }): JSX.Element => (
  <span
    className="inline-block shrink-0 rounded-full border-2 border-[#1e3a5f] border-t-[#38bdf8] animate-rt-spin"
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'warning';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-rt-accent text-white font-semibold border-0 hover:bg-rt-accent-pressed',
  secondary: 'bg-rt-border text-slate-300 font-medium border border-rt-border-strong',
  danger: 'bg-transparent text-rose-400 font-medium border border-[rgba(225,29,72,0.4)]',
  success: 'bg-[rgba(16,185,129,0.12)] text-emerald-400 font-medium border border-[rgba(16,185,129,0.35)]',
  ghost: 'bg-transparent text-rt-muted font-medium border border-rt-border',
  warning: 'bg-[rgba(245,158,11,0.12)] text-amber-400 font-medium border border-[rgba(245,158,11,0.35)]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const Button = ({
  variant = 'primary',
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps): JSX.Element => (
  <button
    type={type}
    className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-[7px] px-3.5 py-2 text-xs transition-[background-color] duration-[120ms]',
      buttonStyles[variant],
      className,
    )}
    {...props}
  >
    {children}
  </button>
);

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
}

export const Input = ({ leading, className, ...props }: InputProps): JSX.Element => (
  <div className="relative flex min-w-0 flex-1 items-center">
    {leading ? <span className="pointer-events-none absolute left-3">{leading}</span> : null}
    <input
      className={cx(
        'w-full rounded-[7px] border border-rt-border-strong bg-rt-raised px-[11px] py-2 text-xs text-rt-text',
        leading ? 'pl-8' : null,
        className,
      )}
      {...props}
    />
  </div>
);

interface ToggleProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export const Toggle = ({ checked, disabled, onChange, label }: ToggleProps): JSX.Element => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cx(
      'relative block h-[21px] w-[38px] shrink-0 rounded-[11px]',
      checked ? 'bg-rt-accent' : 'bg-rt-border',
    )}
  >
    <span
      className={cx(
        'absolute top-[2.5px] h-4 w-4 rounded-full',
        checked ? 'left-[19.5px] bg-white' : 'left-[2.5px] bg-rt-dim',
      )}
    />
  </button>
);

interface DotProps {
  type: string;
  size?: number;
}

export const Dot = ({ type, size = 7 }: DotProps): JSX.Element => {
  const color = nodeColor(type);
  return (
    <span
      className="block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 0 3px ${color}22`,
      }}
      aria-hidden="true"
    />
  );
};

interface TypeBadgeProps {
  type: string;
}

export const TypeBadge = ({ type }: TypeBadgeProps): JSX.Element => {
  const color = nodeColor(type);
  return (
    <span
      className="inline-block rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em]"
      style={{
        color,
        background: `${color}22`,
        border: `1px solid ${color}55`,
        filter: 'brightness(1.45)',
      }}
    >
      {type}
    </span>
  );
};

interface ChipProps {
  active: boolean;
  onClick?: () => void;
  children: ReactNode;
}

export const Chip = ({ active, onClick, children }: ChipProps): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    className={cx(
      'inline-flex items-center gap-1.5 rounded-md px-[9px] py-1 font-mono text-[11px]',
      active
        ? 'border border-[rgba(2,132,199,0.4)] bg-[rgba(2,132,199,0.13)] text-sky-200'
        : 'border border-rt-border bg-rt-raised text-rt-faint',
    )}
  >
    {children}
  </button>
);

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export const Card = ({ children, className, padding = true }: CardProps): JSX.Element => (
  <div
    className={cx(
      'rounded-[10px] border border-rt-border bg-rt-surface',
      padding ? 'px-[18px] py-4' : null,
      className,
    )}
  >
    {children}
  </div>
);

type ToastTone = 'error' | 'success' | 'warning' | 'info';

const toastStyles: Record<ToastTone, string> = {
  error:
    'border-[rgba(225,29,72,0.35)] border-l-rt-error bg-[rgba(225,29,72,0.08)] text-rose-200',
  success:
    'border-[rgba(16,185,129,0.3)] border-l-rt-success bg-[rgba(16,185,129,0.07)] text-emerald-200',
  warning:
    'border-[rgba(245,158,11,0.32)] border-l-rt-warning bg-[rgba(245,158,11,0.08)] text-amber-200',
  info: 'border-[rgba(2,132,199,0.35)] border-l-rt-accent bg-[rgba(2,132,199,0.09)] text-sky-200',
};

interface ToastProps {
  tone: ToastTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export const Toast = ({ tone, children, className, icon, action }: ToastProps): JSX.Element => (
  <div
    className={cx(
      'flex items-center gap-2.5 rounded-lg border border-l-[3px] px-[15px] py-2.5 text-[12.5px]',
      toastStyles[tone],
      className,
    )}
  >
    {icon}
    <div className="min-w-0 flex-1">{children}</div>
    {action}
  </div>
);

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  tall?: boolean;
}

export const EmptyState = ({
  title,
  description,
  action,
  icon,
  tall,
}: EmptyStateProps): JSX.Element => (
  <div
    className={cx(
      'flex flex-col items-center rounded-[10px] border border-dashed border-rt-border bg-rt-raised px-8 text-center',
      tall ? 'h-[430px] justify-center' : 'py-14',
    )}
  >
    {icon ? (
      <div className="mb-3.5 flex h-11 w-11 items-center justify-center rounded-[10px] border border-rt-border bg-rt-surface">
        {icon}
      </div>
    ) : null}
    <div className="text-[15px] font-semibold text-rt-text">{title}</div>
    <div className="mt-1.5 max-w-[360px] text-[12.5px] text-rt-dim">{description}</div>
    {action ? <div className="mt-[18px]">{action}</div> : null}
  </div>
);

interface SegmentedProps<T extends string> {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
}: SegmentedProps<T>): JSX.Element => (
  <div className="flex gap-0.5 rounded-[7px] border border-rt-border-strong bg-rt-raised p-0.5">
    {options.map((option) => {
      const active = option === value;
      return (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={cx(
            'rounded-[5px] px-2.5 py-1 text-[11px]',
            active ? 'bg-rt-border font-semibold text-rt-heading' : 'bg-transparent font-medium text-rt-dim',
          )}
        >
          {option}
        </button>
      );
    })}
  </div>
);
