import { Suspense } from "react";
import { Mail, MessageCircle, Plus, Trash2 } from "lucide-react";
import { dbRows } from "@/lib/db";
import { renderTemplate, templateVars, TEMPLATE_VARIABLES } from "@/lib/templates";
import { Badge, Card, EmptyState, MigrationNotice, PageHeader, btn, inputCls, isMissingTable } from "@/components/ui-kit";
import { createTemplate, deleteTemplate, setDefaultTemplate, toggleTemplate, updateTemplate } from "./actions";

export const metadata = { title: "Plantillas" };

type Template = { id: string; name: string; channel: "whatsapp" | "email"; subject: string | null; body: string; is_default: boolean; active: boolean };

const SAMPLE = templateVars({ name: "DENT CARE DENTISTA", company: "DENT CARE DENTISTA", city: "MONTERREY,Monterrey,NUEVO LEÓN", notes: "Consultorios dentales del sector privado" }, undefined, "su sitio tarda 6 s en cargar en celular y no está adaptado a celulares");

export default function Page(props: PageProps<"/plantillas">) {
  return (
    <>
      <PageHeader title="Plantillas" subtitle="Mensajes listos para WhatsApp y correo. Se llenan solos con los datos de cada prospecto." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <Templates searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

function TemplateForm({ action, t, submit }: { action: (fd: FormData) => Promise<void>; t?: Template; submit: string }) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input name="name" required defaultValue={t?.name} placeholder="Nombre de la plantilla *" className={inputCls} />
      <select name="channel" defaultValue={t?.channel ?? "whatsapp"} className={inputCls}>
        <option value="whatsapp">WhatsApp</option>
        <option value="email">Correo</option>
      </select>
      <input name="subject" defaultValue={t?.subject ?? ""} placeholder="Asunto (solo correo)" className={`${inputCls} sm:col-span-2`} />
      <textarea name="body" required rows={6} defaultValue={t?.body} placeholder="Escribe el mensaje. Usa variables como {{empresa}}" className={`${inputCls} sm:col-span-2`} />
      <div className="sm:col-span-2">
        <button className={btn.primary}>{submit}</button>
      </div>
    </form>
  );
}

async function Templates({ searchParams }: { searchParams: PageProps<"/plantillas">["searchParams"] }) {
  const { error: errorParam } = await searchParams;
  const { data, error } = await dbRows("select * from message_templates order by channel, created_at");

  if (isMissingTable(error)) return <MigrationNotice file="0008_message_templates.sql" />;

  const templates = (data ?? []) as Template[];

  return (
    <div className="space-y-6">
      {typeof errorParam === "string" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{errorParam}</p>}

      <Card className="p-5">
        <p className="text-sm font-bold">Variables disponibles</p>
        <p className="mt-1 text-xs text-muted-foreground">Se reemplazan con los datos del prospecto al momento de enviar.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {TEMPLATE_VARIABLES.map(([v, label]) => (
            <span key={v} className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs">
              <code className="font-bold">{v}</code> <span className="text-muted-foreground">· {label}</span>
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          <strong>{"{{negocio}}"}</strong> toma el valor de la variable <code>NEXT_PUBLIC_BUSINESS_NAME</code> en Vercel (y <code>BUSINESS_NAME</code> en el worker para el botón de Telegram).
        </p>
      </Card>

      <details className="rounded-2xl border bg-card shadow-sm" open={!templates.length}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-bold">
          <Plus className="size-4 text-primary" /> Nueva plantilla
        </summary>
        <div className="border-t p-5">
          <TemplateForm action={createTemplate} submit="Crear plantilla" />
        </div>
      </details>

      {(["whatsapp", "email"] as const).map((channel) => {
        const list = templates.filter((t) => t.channel === channel);
        if (!list.length) return null;
        const Icon = channel === "whatsapp" ? MessageCircle : Mail;
        return (
          <section key={channel}>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <Icon className="size-3.5" /> {channel === "whatsapp" ? "WhatsApp" : "Correo"}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {list.map((t) => (
                <Card key={t.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <h3 className="font-bold">{t.name}</h3>
                    <div className="flex shrink-0 gap-1.5">
                      {t.is_default && <Badge className="bg-primary/10 text-primary ring-primary/20">Por defecto</Badge>}
                      {!t.active && <Badge className="bg-zinc-100 text-zinc-600 ring-zinc-200">Oculta</Badge>}
                    </div>
                  </div>
                  <div className="space-y-2 px-5 py-4">
                    {t.subject && <p className="text-xs font-semibold">Asunto: {renderTemplate(t.subject, SAMPLE)}</p>}
                    <p className="whitespace-pre-line rounded-xl bg-secondary/70 p-3 text-sm leading-relaxed">{renderTemplate(t.body, SAMPLE)}</p>
                    <p className="text-[11px] text-muted-foreground">Vista previa con un prospecto de ejemplo.</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-5 py-3">
                    {!t.is_default && (
                      <form action={setDefaultTemplate.bind(null, t.id, t.channel)}>
                        <button className={`${btn.outline} px-3 py-1.5 text-xs`}>Usar por defecto</button>
                      </form>
                    )}
                    <form action={toggleTemplate.bind(null, t.id, !t.active)}>
                      <button className={`${btn.ghost} text-xs`}>{t.active ? "Ocultar" : "Mostrar"}</button>
                    </form>
                    <form action={deleteTemplate.bind(null, t.id)} className="ml-auto">
                      <button aria-label="Eliminar plantilla" className={`${btn.ghost} text-rose-600 hover:text-rose-700`}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </form>
                  </div>
                  <details className="border-t">
                    <summary className="cursor-pointer list-none px-5 py-3 text-xs font-semibold text-primary">Editar</summary>
                    <div className="border-t p-5">
                      <TemplateForm action={updateTemplate.bind(null, t.id)} t={t} submit="Guardar cambios" />
                    </div>
                  </details>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      {!templates.length && (
        <Card>
          <EmptyState title="Aún no tienes plantillas" text="Crea una arriba, o ejecuta la migración 0008 para cargar tres de ejemplo." />
        </Card>
      )}
    </div>
  );
}
