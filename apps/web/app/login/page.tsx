"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { btn, inputCls } from "@/components/ui-kit";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos" : error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-sidebar p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-sidebar-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-20 size-96 rounded-full bg-sky-500/10 blur-3xl" />
      <form onSubmit={onSubmit} className="relative w-full max-w-sm space-y-5 rounded-3xl bg-card p-8 shadow-2xl">
        <div>
          <span className="grid size-12 place-items-center rounded-2xl bg-sidebar text-2xl font-extrabold text-sidebar-primary">P</span>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Prospecta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Inicia sesión para ver tus prospectos y clientes.</p>
        </div>
        <div className="space-y-3">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo" className={inputCls} />
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" className={inputCls} />
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <button type="submit" disabled={loading} className={`${btn.primary} w-full py-2.5`}>
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
