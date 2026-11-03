export const APP_TZ = "America/Mexico_City";

export const LEAD_STATUSES = ["new", "contacted", "replied", "qualified", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  replied: "Respondió",
  qualified: "Calificado",
  won: "Ganado",
  lost: "Perdido",
};

/** Clases de Tailwind por estado (badge) */
export const STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-sky-100 text-sky-800 ring-sky-200",
  contacted: "bg-amber-100 text-amber-800 ring-amber-200",
  replied: "bg-violet-100 text-violet-800 ring-violet-200",
  qualified: "bg-teal-100 text-teal-800 ring-teal-200",
  won: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  lost: "bg-rose-100 text-rose-800 ring-rose-200",
};

/** Color sólido por estado (barras, columnas del kanban) */
export const STATUS_BAR: Record<LeadStatus, string> = {
  new: "bg-sky-500",
  contacted: "bg-amber-500",
  replied: "bg-violet-500",
  qualified: "bg-teal-500",
  won: "bg-emerald-500",
  lost: "bg-rose-500",
};

export const PROJECT_STATUSES = ["onboarding", "design", "development", "review", "delivered", "paused"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_LABEL: Record<ProjectStatus, string> = {
  onboarding: "Onboarding",
  design: "Diseño",
  development: "Desarrollo",
  review: "Revisión",
  delivered: "Entregado",
  paused: "Pausado",
};

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_LABEL: Record<QuoteStatus, string> = {
  draft: "Borrador",
  sent: "Enviada",
  accepted: "Aceptada",
  rejected: "Rechazada",
};

export const QUOTE_TONE: Record<QuoteStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  sent: "bg-sky-100 text-sky-800 ring-sky-200",
  accepted: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  rejected: "bg-rose-100 text-rose-800 ring-rose-200",
};

export const CURRENCIES = ["USD", "MXN", "COP", "EUR"] as const;
