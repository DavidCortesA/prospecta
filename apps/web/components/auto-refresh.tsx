"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Mientras `active` es true, vuelve a pedir los datos del servidor cada pocos segundos (p. ej. una revisión en curso). */
export function AutoRefresh({ active, everyMs = 5000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(id);
  }, [active, everyMs, router]);
  return null;
}
