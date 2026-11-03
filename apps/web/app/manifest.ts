import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Prospecta",
    short_name: "Prospecta",
    description: "Captación y seguimiento de clientes",
    lang: "es-MX",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#0f1b2d",
    theme_color: "#0f1b2d",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Prospectos", url: "/prospectos", icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }] },
      { name: "Mapa", url: "/mapa", icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }] },
      { name: "Nueva cotización", url: "/cotizaciones/nueva", icons: [{ src: "/icons/192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
