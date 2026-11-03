import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prospecta",
    short_name: "Prospecta",
    description: "Captación y seguimiento de clientes",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f1b2d",
    theme_color: "#0f1b2d",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Prospectos", url: "/prospectos" },
      { name: "Nueva cotización", url: "/cotizaciones/nueva" },
    ],
  };
}
