import { Suspense, type ReactNode } from "react";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/server";
import { AppShell } from "@/components/app-shell";
import { firstName } from "@/lib/format";

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

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell
      footer={
        <Suspense fallback={<div className="h-9" />}>
          <UserFooter />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
