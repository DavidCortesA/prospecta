// Sustituye a `dotenv/config` en el Worker (no hay archivo .env ni sistema de archivos):
// las variables llegan como secretos del Worker y worker.ts las copia a process.env.
export {};
