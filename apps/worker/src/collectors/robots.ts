import { createRequire } from "node:module";
import { config } from "../config.js";
import { assertPublicUrl } from "../audit/ssrf.js";

type Robot = { isAllowed(url: string, ua?: string): boolean | undefined };

// robots-parser exporta la función con `module.exports`, pero sus typings declaran un export
// default; con NodeNext eso no coincide, así que se carga con require y se tipa a mano.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  robotstxt: string
) => Robot;

export type RobotsVerdict = "allowed" | "disallowed" | "unreachable";

const MAX_REDIRECTS = 3;
const MAX_BYTES = 500_000;

/** Descarga robots.txt validando que cada redirección siga siendo una dirección pública. */
async function fetchRobots(origin: string): Promise<{ status: number; body: string } | null> {
  let target = `${origin}/robots.txt`;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    try {
      await assertPublicUrl(target);
      const res = await fetch(target, {
        headers: { "user-agent": config.userAgent },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        target = new URL(res.headers.get("location")!, target).toString();
        continue;
      }
      const body = (await res.text()).slice(0, MAX_BYTES);
      return { status: res.status, body };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * - "allowed": robots.txt permite a nuestro user-agent entrar a `url` (o no existe, 404).
 * - "disallowed": lo prohíbe.
 * - "unreachable": no se pudo consultar (el sitio caído, error del servidor, etc.).
 */
export async function checkRobots(url: string): Promise<RobotsVerdict> {
  const { origin } = new URL(url);
  const res = await fetchRobots(origin);
  if (!res) return "unreachable";
  if (res.status === 404 || res.status === 410) return "allowed";
  if (res.status >= 500) return "unreachable";
  if (res.status >= 400) return "allowed"; // otros 4xx: sin robots.txt utilizable (RFC 9309)
  const robots = robotsParser(`${origin}/robots.txt`, res.body);
  return robots.isAllowed(url, config.userAgent) === false ? "disallowed" : "allowed";
}

/** Estricto (para scraping de fuentes): solo true si robots.txt lo permite con certeza. */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  return (await checkRobots(url)) === "allowed";
}
