import type { FormEvent, ReactNode } from "react";

interface AuthFormShellProps {
  title: string;
  subtitle?: string;
  onSubmit: (e: FormEvent) => void;
  error?: string | null;
  submitting: boolean;
  submitLabel: string;
  submittingLabel: string;
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthFormShell({
  title,
  subtitle,
  onSubmit,
  error,
  submitting,
  submitLabel,
  submittingLabel,
  footer,
  children,
}: AuthFormShellProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>

        {children}

        {error && (
          <p className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:bg-slate-400"
        >
          {submitting ? submittingLabel : submitLabel}
        </button>

        {footer && <div className="pt-2 text-center text-xs text-slate-500">{footer}</div>}
      </form>
    </div>
  );
}

interface AuthFieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}

export function AuthField({
  label,
  type,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: AuthFieldProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
      />
    </label>
  );
}
