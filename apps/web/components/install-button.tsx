"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const noopSubscribe = () => () => {};

/** ¿La app ya corre instalada (ventana propia / pantalla de inicio)? En el servidor se asume que sí para no mostrar el botón. */
function useStandalone() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(display-mode: standalone)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => true
  );
}

const useIos = () => useSyncExternalStore(noopSubscribe, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false);

/**
 * Botón «Instalar app». En Chrome/Edge/Android usa el aviso nativo; en iPhone/iPad (Safari no lo tiene) muestra
 * cómo añadirla a la pantalla de inicio. No aparece si la app ya está instalada.
 */
export function InstallButton() {
  const standalone = useStandalone();
  const ios = useIos();
  const [promptEvent, setPromptEvent] = useState<InstallEvent | null>(null);
  const [installedNow, setInstalledNow] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // se guarda para lanzarlo cuando la persona pulse el botón
      setPromptEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setInstalledNow(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installedNow || (!promptEvent && !ios)) return null;

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={async () => {
          if (promptEvent) {
            await promptEvent.prompt();
            await promptEvent.userChoice;
            setPromptEvent(null);
          } else {
            setShowIosHelp((v) => !v);
          }
        }}
        className="flex w-full items-center gap-3 rounded-lg border border-sidebar-border px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Download className="size-4 text-sidebar-primary" /> Instalar app
      </button>
      {showIosHelp && (
        <p className="mt-2 flex gap-2 rounded-lg bg-sidebar-accent/60 p-3 text-xs leading-relaxed text-sidebar-foreground/80">
          <Share className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
          <span>
            En Safari pulsa <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.
          </span>
        </p>
      )}
    </div>
  );
}
