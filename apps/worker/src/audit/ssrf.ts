import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Protección contra SSRF: el worker visita URLs que vienen de datos externos (DENUE, captura manual), así que
 * nunca debe llegar a direcciones privadas, de loopback o internas (Redis y otros servicios de la red de Railway,
 * metadatos de la nube, etc.).
 */

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "esta red"
  ["10.0.0.0", 8], // privada
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (incluye metadatos de nube 169.254.169.254)
  ["172.16.0.0", 12], // privada
  ["192.0.0.0", 24],
  ["192.168.0.0", 16], // privada
  ["198.18.0.0", 15], // pruebas
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reservada
];

export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = ipv4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (kind === 6) {
    const v = ip.toLowerCase();
    // IPv4 mapeada: Node la normaliza a hexadecimal (::ffff:a00:1 = 10.0.0.1); también se acepta con puntos
    const dotted = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return (
      v.startsWith("::") || // ::, ::1, IPv4 compatible y cualquier otro rango reservado que empiece así
      v.startsWith("64:ff9b:") || // NAT64: puede apuntar a una IPv4 privada
      v.startsWith("100:") || // descarte
      v.startsWith("2001:db8") || // documentación
      v.startsWith("fc") || // fc00::/7 (únicas locales)
      v.startsWith("fd") ||
      v.startsWith("fe8") || // fe80::/10 (link-local)
      v.startsWith("fe9") ||
      v.startsWith("fea") ||
      v.startsWith("feb") ||
      v.startsWith("ff") // multicast
    );
  }
  return true; // si no es una IP válida, por seguridad se trata como no permitida
}

const BLOCKED_SUFFIXES = [".internal", ".local", ".localhost", ".lan", ".intranet", ".corp", ".home"];

const cache = new Map<string, { ok: boolean; at: number }>();
const CACHE_MS = 60_000;

/** Lanza un Error si la URL no es http(s) público. Resuelve el DNS y revisa TODAS las direcciones. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("La URL no es válida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Solo se permiten URLs http o https");
  if (url.username || url.password) throw new Error("La URL no puede incluir usuario ni contraseña");
  if (url.port && !["80", "443"].includes(url.port)) throw new Error("Solo se permiten los puertos 80 y 443");

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes(".") && !isIP(host)) {
    throw new Error("Esa dirección no es pública");
  }

  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    if (!hit.ok) throw new Error("Esa dirección no es pública");
    return url;
  }

  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new Error("No se pudo resolver el dominio");
  const ok = addresses.every((a) => !isPrivateAddress(a.address));
  cache.set(host, { ok, at: Date.now() });
  if (!ok) throw new Error("Esa dirección no es pública");
  return url;
}

// normalizeWebsite vive en url.ts (sin dependencias de Node) para poder usarse desde el Worker de Cloudflare
export { normalizeWebsite } from "./url.js";
