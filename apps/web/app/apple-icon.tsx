import { appIcon } from "@/lib/icon";

// Ícono al "Añadir a pantalla de inicio" en iPhone/iPad
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return appIcon(180);
}
