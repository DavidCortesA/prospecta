import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
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
};
