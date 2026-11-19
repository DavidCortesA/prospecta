import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Se excluyen los archivos que el navegador pide sin sesión (PWA: manifest, service worker, íconos, favicon, robots, offline)
// las cotizaciones públicas (/q/<token>), que protege su token secreto, y el webhook de WhatsApp (api/whatsapp/),
// que no tiene sesión y se valida con la firma de Kapso.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|icon$|apple-icon$|robots\.txt$|offline.html|q/|api/whatsapp/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
