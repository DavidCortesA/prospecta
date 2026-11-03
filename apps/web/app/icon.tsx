import { appIcon } from "@/lib/icon";

// Favicon de la pestaña (reemplaza al logo por defecto de Next.js)
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return appIcon(64);
}
