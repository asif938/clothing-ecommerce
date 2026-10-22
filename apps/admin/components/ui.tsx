"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-theme border border-border bg-surface p-6 ${className}`}>{children}</div>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-brand text-brand-foreground hover:opacity-90",
    secondary: "bg-muted text-surface-foreground hover:opacity-80",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button
      className={`rounded-theme px-4 py-2 text-sm font-medium disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

export function TextField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-surface-foreground">{label}</span>
      <input
        className="rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none focus:border-brand"
        {...props}
      />
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

export function FieldLabel({ children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-surface-foreground" {...props}>
      {children}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`h-6 w-11 rounded-full p-0.5 transition-colors ${checked ? "bg-brand" : "bg-muted"} disabled:opacity-50`}
    >
      <span className={`block h-5 w-5 rounded-full bg-surface transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export function Banner({ kind, children }: { kind: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const styles = {
    error: "bg-danger/10 text-danger border-danger/30",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    info: "bg-muted text-surface-foreground border-border",
  }[kind];
  return <div className={`rounded-theme border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}
