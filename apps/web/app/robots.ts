import type { MetadataRoute } from "next";

// App privada: no debe aparecer en buscadores.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
