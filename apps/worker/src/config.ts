import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

/** Número de una variable de entorno; vacía o no numérica = valor por defecto. */
function numberEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const config = {
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  /** Conexión directa a Neon (el worker es un proceso de larga duración: pool de node-postgres) */
  databaseUrl: required("DATABASE_URL"),
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  userAgent: process.env.USER_AGENT ?? "ProspectaBot/0.3",
  /** Zona horaria para "hoy", el resumen diario y los saludos */
  timezone: process.env.APP_TZ ?? "America/Mexico_City",
  /** Cron del resumen diario de Telegram (por defecto, todos los días a las 9:00) */
  digestCron: process.env.DIGEST_CRON ?? "0 9 * * *",
  /** Nombre de tu empresa para la variable {{negocio}} de las plantillas */
  businessName: process.env.BUSINESS_NAME ?? "Prospecta",
  /** URL pública del dashboard (opcional): agrega un botón "Abrir en el dashboard" a los avisos */
  dashboardUrl: process.env.DASHBOARD_URL?.replace(/\/$/, ""),
  /** Primer mensaje automático de WhatsApp (Kapso). Apagado salvo WHATSAPP_OUTREACH=on */
  whatsapp: {
    enabled: process.env.WHATSAPP_OUTREACH === "on",
    apiKey: process.env.KAPSO_API_KEY,
    phoneNumberId: process.env.KAPSO_PHONE_NUMBER_ID,
    /** Plantilla aprobada por Meta con la que se inicia la conversación */
    templateName: process.env.WHATSAPP_TEMPLATE_NAME,
    // GitHub Actions entrega los secretos que no existen como texto vacío: aquí vacío = valor por defecto
    templateLang: process.env.WHATSAPP_TEMPLATE_LANG || "es_MX",
    /** Variables de Prospecta que llenan {{1}}, {{2}}… de la plantilla, en orden (ver TEMPLATE_VARIABLES) */
    templateVars: (process.env.WHATSAPP_TEMPLATE_VARS || "empresa,negocio").split(",").map((s) => s.trim()).filter(Boolean),
    dailyLimit: numberEnv("WHATSAPP_DAILY_LIMIT", 20),
    perRun: numberEnv("WHATSAPP_PER_RUN", 5),
    /** Horario de envío en la zona horaria de la app, lunes a sábado: "9-18" = de 9:00 a 17:59 */
    hours: process.env.WHATSAPP_SEND_HOURS || "9-18",
    minScore: numberEnv("WHATSAPP_MIN_SCORE", 0),
  },
};
