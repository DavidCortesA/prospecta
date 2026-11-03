import { createRequire } from "node:module";
import { config } from "../config.js";

type Robot = { isAllowed(url: string, ua?: string): boolean | undefined };

// robots-parser exporta la función con `module.exports`, pero sus typings declaran un export
// default; con NodeNext eso no coincide, así que se carga con require y se tipa a mano.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  robotstxt: string
) => Robot;

/** Devuelve true solo si robots.txt permite explícitamente a nuestro user-agent entrar a `url`. */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const { origin } = new URL(url);
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": config.userAgent },
    });
    // Sin robots.txt (404) se considera permitido; cualquier otro fallo, no.
    if (res.status === 404) return true;
    if (!res.ok) return false;
    const robots = robotsParser(`${origin}/robots.txt`, await res.text());
    return robots.isAllowed(url, config.userAgent) ?? false;
  } catch {
    return false;
  }
}
