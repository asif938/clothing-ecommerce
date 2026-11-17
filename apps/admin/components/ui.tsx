"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

/** A white panel raised a hair off the page canvas: a hairline border plus the faintest shadow, no heavy outline. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-theme border border-border bg-surface p-5 shadow-[0_1px_2px_rgb(17_24_39/0.04)] sm:p-6 ${className}`}>{children}</div>;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-brand text-brand-foreground hover:opacity-90",
    secondary: "border border-border bg-surface text-surface-foreground hover:bg-muted",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-theme px-4 py-2 text-sm font-medium transition-[background-color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${styles} ${className}`}
      {...props}
    />
  );
}

const inputClass =
  "rounded-theme border border-border bg-surface px-3 py-2 text-sm text-surface-foreground outline-none transition-[border-color,box-shadow] placeholder:text-surface-foreground/40 focus:border-brand focus:ring-2 focus:ring-brand/10";

export function TextField({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-surface-foreground">{label}</span>
      <input className={`${inputClass} ${error ? "border-danger focus:border-danger focus:ring-danger/10" : ""}`} {...props} />
      {error && <span className="text-xs text-danger">{error}</span>}
    </label>
  );
}

export function FieldLabel({ children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-surface-foreground" {...props}>
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
      // Off is a visible mid-grey track (the old near-white one vanished on a white card).
      className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${checked ? "bg-brand" : "bg-surface-foreground/20"} disabled:opacity-50`}
    >
      <span className={`block h-5 w-5 rounded-full bg-surface shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export function Banner({ kind, children }: { kind: "error" | "success" | "info" | "warning"; children: ReactNode }) {
  const styles = {
    error: "bg-danger/10 text-danger border-danger/30",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    info: "bg-surface text-surface-foreground border-border",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`rounded-theme border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}
