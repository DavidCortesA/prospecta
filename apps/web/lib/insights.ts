export type Insight = { tone: "good" | "warn" | "info"; text: string };

export type OverviewStats = {
  total: number;
  byStatus: Record<string, number>;
  thisWeek: number;
  lastWeek: number;
  staleContacted: number; // contactados sin movimiento > 5 días
  followupsDue?: number; // seguimientos de hoy o vencidos
  followupsOverdue?: number;
  closeRate: number | null; // % ganados sobre cerrados
  failedRuns24h: number;
  activeSources: number;
  // opcionales: se llenan cuando existen las tablas de cotizaciones / clientes
  quotesAwaiting?: number;
  quotesAwaitingValue?: number;
  activeProjects?: number;
};

/** Frases que el dashboard "dice" al abrir: qué atender primero. */
export function buildInsights(s: OverviewStats): Insight[] {
  const out: Insight[] = [];
  const n = (k: string) => s.byStatus[k] ?? 0;

  if (s.activeSources === 0) {
    out.push({ tone: "warn", text: "Aún no tienes fuentes activas, así que el bot no está trayendo prospectos. Agrega una en Fuentes." });
  }
  if (s.failedRuns24h > 0) {
    out.push({
      tone: "warn",
      text: `${s.failedRuns24h} ${s.failedRuns24h === 1 ? "ejecución falló" : "ejecuciones fallaron"} en las últimas 24 h. Revisa Fuentes para ver el error.`,
    });
  }
  if (s.followupsDue) {
    const overdue = s.followupsOverdue ?? 0;
    out.push({
      tone: "warn",
      text:
        `Tienes ${s.followupsDue} ${s.followupsDue === 1 ? "seguimiento" : "seguimientos"} para hoy` +
        (overdue ? `, ${overdue} ya ${overdue === 1 ? "vencido" : "vencidos"}.` : "."),
    });
  }
  if (n("new") > 0) {
    out.push({ tone: "info", text: `Tienes ${n("new")} ${n("new") === 1 ? "prospecto nuevo" : "prospectos nuevos"} sin contactar.` });
  }
  if (n("replied") > 0) {
    out.push({ tone: "good", text: `${n("replied")} ${n("replied") === 1 ? "prospecto respondió" : "prospectos respondieron"}: es buen momento para cotizar.` });
  }
  if (s.quotesAwaiting) {
    out.push({ tone: "info", text: `${s.quotesAwaiting} ${s.quotesAwaiting === 1 ? "cotización espera" : "cotizaciones esperan"} respuesta del cliente.` });
  }
  if (s.staleContacted > 0) {
    out.push({
      tone: "warn",
      text: `${s.staleContacted} ${s.staleContacted === 1 ? "prospecto lleva" : "prospectos llevan"} más de 5 días contactados sin movimiento. Da seguimiento.`,
    });
  }
  if (s.thisWeek > s.lastWeek && s.thisWeek > 0) {
    out.push({ tone: "good", text: `Esta semana llegaron ${s.thisWeek} prospectos, más que los ${s.lastWeek} de la semana pasada.` });
  } else if (s.lastWeek > 0 && s.thisWeek < s.lastWeek) {
    out.push({ tone: "info", text: `Esta semana van ${s.thisWeek} prospectos frente a ${s.lastWeek} la semana pasada.` });
  }
  if (s.closeRate !== null && n("won") + n("lost") >= 3) {
    out.push({ tone: s.closeRate >= 30 ? "good" : "info", text: `Tu tasa de cierre es ${s.closeRate}% (${n("won")} ganados de ${n("won") + n("lost")} cerrados).` });
  }
  if (s.activeProjects) {
    out.push({ tone: "info", text: `Tienes ${s.activeProjects} ${s.activeProjects === 1 ? "proyecto activo" : "proyectos activos"} con clientes.` });
  }
  if (!out.length) out.push({ tone: "info", text: "Todo en orden por ahora. Cuando lleguen prospectos, te digo por dónde empezar." });
  return out;
}
