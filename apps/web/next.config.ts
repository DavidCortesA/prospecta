import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// El navegador solo debe hablar con la propia app y con tu proyecto de Supabase.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();

/**
 * Content-Security-Policy. Se permite 'unsafe-inline' en scripts y estilos porque Next inyecta scripts de
 * hidratación en línea; con nonces habría que renderizar TODAS las páginas de forma dinámica (incluido /login).
 * El resto de directivas sí es estricto: sin scripts externos, sin frames, sin formularios hacia otros sitios y
 * conexiones solo a la app y a Supabase.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org", // mapa base de Leaflet y capturas (data:)
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, "wss:")}`.trim(),
  "worker-src 'self'", // service worker de la PWA
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // geolocation=(self): el mapa usa «Mi ubicación»
  { key: "Permissions-Policy", value: "camera=(), microphone=(), payment=(), usb=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // En desarrollo el CSP estorba al hot-reload (eval, websockets); solo se aplica en producción.
  // HSTS ya lo manda Vercel.
  ...(isProd ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false, // no anunciar «X-Powered-By: Next.js»
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        // Cotización pública: el token viaja en la URL, así que no se filtra por Referer, no se guarda en caché ni se indexa
        source: "/q/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      {
        // El service worker debe revalidarse siempre para que las actualizaciones lleguen
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
