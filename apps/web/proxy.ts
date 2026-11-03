import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Se excluyen los archivos que el navegador pide sin sesión (PWA: manifest, service worker, íconos, offline).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
