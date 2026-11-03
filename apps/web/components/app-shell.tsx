"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  Columns3,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  MessageSquareText,
  Package,
  Radar,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InstallButton } from "@/components/install-button";

const NAV = [
  { href: "/", label: "Resumen", icon: LayoutDashboard, group: "Vender" },
  { href: "/prospectos", label: "Prospectos", icon: Users, group: "Vender" },
  { href: "/pipeline", label: "Pipeline", icon: Columns3, group: "Vender" },
  { href: "/mapa", label: "Mapa", icon: MapIcon, group: "Vender" },
  { href: "/plantillas", label: "Plantillas", icon: MessageSquareText, group: "Vender" },
  { href: "/cierres", label: "Cierres", icon: Trophy, group: "Vender" },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText, group: "Cotizar" },
  { href: "/catalogo", label: "Catálogo", icon: Package, group: "Cotizar" },
  { href: "/clientes", label: "Clientes", icon: Briefcase, group: "Entregar" },
  { href: "/fuentes", label: "Fuentes", icon: Radar, group: "Configurar" },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = Array.from(new Set(NAV.map((n) => n.group)));

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((group) => (
        <div key={group}>
          <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sidebar-foreground/40">
            {group}
          </p>
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === group).map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)]"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <Icon className={cn("size-4", active && "text-sidebar-primary")} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <span className="grid size-9 place-items-center rounded-xl bg-sidebar-primary text-lg font-extrabold text-sidebar-primary-foreground">
        P
      </span>
      <div className="leading-tight">
        <p className="text-sm font-extrabold tracking-tight text-sidebar-accent-foreground">Prospecta</p>
        <p className="text-[11px] text-sidebar-foreground/50">Captación de clientes</p>
      </div>
    </div>
  );
}

export function AppShell({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr] print:block">
      {/* Sidebar escritorio */}
      <aside className="no-print sticky top-0 hidden h-screen flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <Brand />
        <Suspense fallback={<nav className="flex-1" />}>
          <NavList />
        </Suspense>
        <InstallButton />
        <div className="border-t border-sidebar-border p-4">{footer}</div>
      </aside>

      {/* Barra superior móvil */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-sidebar px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-sidebar-accent-foreground lg:hidden">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-sidebar-primary font-extrabold text-sidebar-primary-foreground">
            P
          </span>
          <span className="font-extrabold tracking-tight">Prospecta</span>
        </div>
        <button aria-label="Abrir menú" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-sidebar-accent">
          <Menu className="size-5" />
        </button>
      </header>

      {/* Menú móvil */}
      {open && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <button aria-label="Cerrar menú" className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
            <div className="flex items-center justify-between pr-3">
              <Brand />
              <button aria-label="Cerrar" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-sidebar-accent">
                <X className="size-5" />
              </button>
            </div>
            <Suspense fallback={<nav className="flex-1" />}>
              <NavList onNavigate={() => setOpen(false)} />
            </Suspense>
            <InstallButton />
            <div className="border-t border-sidebar-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-10 lg:py-8 print:p-0">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
