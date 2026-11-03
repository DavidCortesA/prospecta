import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Se excluyen los archivos que el navegador pide sin sesión (PWA: manifest, service worker, íconos, favicon, robots, offline)
// y las cotizaciones públicas (/q/<token>), que protege su token secreto.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|icon$|apple-icon$|robots\.txt$|offline.html|q/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
