import { Suspense, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/server";
import { AppShell } from "@/components/app-shell";
import { firstName } from "@/lib/format";
import { getAppUser } from "@/lib/auth";

async function UserFooter() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = (data?.claims?.email as string | undefined) ?? "";
  const name = firstName(email, (data?.claims?.user_metadata as { full_name?: string } | undefined)?.full_name);

  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground">
        {name[0] ?? "?"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{name || "Usuario"}</p>
        <p className="truncate text-[11px] text-sidebar-foreground/50">{email}</p>
      </div>
      <form action="/auth/signout" method="post">
        <button aria-label="Cerrar sesión" title="Cerrar sesión" className="rounded-lg p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
          <LogOut className="size-4" />
        </button>
      </form>
    </div>
  );
}

/**
 * Puerta de acceso: solo los usuarios de public.app_users (migración 0013) pueden ver datos.
 * Aunque la base ya devuelve vacío a cualquier otra cuenta, aquí se avisa en lugar de mostrar pantallas vacías.
 * Si la función aún no existe (migración sin aplicar) no se bloquea a nadie.
 */
async function AccessGate({ children }: { children: ReactNode }) {
  const user = await getAppUser();
  if (!user) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-extrabold tracking-tight">Tu cuenta no tiene acceso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Iniciaste sesión, pero esta cuenta no está autorizada en Prospecta. Pide a quien administra el sistema que te dé acceso.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-secondary">Cerrar sesión</button>
        </form>
      </div>
    );
  }
  return <>{children}</>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      footer={
        <Suspense fallback={<div className="h-9" />}>
          <UserFooter />
        </Suspense>
      }
    >
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-secondary" />}>
        <AccessGate>{children}</AccessGate>
      </Suspense>
    </AppShell>
  );
}
