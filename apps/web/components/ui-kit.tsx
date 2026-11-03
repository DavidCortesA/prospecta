import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type LeadStatus } from "@/lib/constants";

export const inputCls =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 placeholder:text-muted-foreground/70";

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50",
  outline:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-semibold transition hover:bg-secondary disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100",
};

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border bg-card shadow-sm", className)}>{children}</div>;
}

export function CardHeader({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 className="text-sm font-bold tracking-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "text-primary bg-primary/10",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {icon && <span className={cn("grid size-8 place-items-center rounded-lg", tone)}>{icon}</span>}
      </div>
      <p className="mt-3 text-3xl font-extrabold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status as LeadStatus;
  return <Badge className={STATUS_TONE[s] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200"}>{STATUS_LABEL[s] ?? status}</Badge>;
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Se muestra cuando una tabla aún no existe porque falta ejecutar una migración en Supabase. */
export function MigrationNotice({ file }: { file: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
      <p className="font-bold">Falta ejecutar una migración en Supabase</p>
      <p className="mt-1">
        Abre el SQL Editor de Supabase y ejecuta <code className="rounded bg-amber-100 px-1.5 py-0.5">{file}</code>{" "}
        (carpeta <code className="rounded bg-amber-100 px-1.5 py-0.5">supabase/migrations</code> del repo). Después recarga esta página.
      </p>
    </div>
  );
}

export const isMissingTable = (error: { code?: string } | null | undefined) =>
  error?.code === "PGRST205" || error?.code === "42P01";

/** Columna que aún no existe porque falta ejecutar una migración. */
export const isMissingColumn = (error: { code?: string } | null | undefined) =>
  error?.code === "42703" || error?.code === "PGRST204";

export function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof btn;
}) {
  return (
    <Link href={href} className={btn[variant]}>
      {children}
    </Link>
  );
}
