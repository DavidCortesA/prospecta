import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRightLeft, FileText, Mail, MessageCircle, Sparkles, StickyNote, Trophy, XCircle, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/server";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { dateTime, dayLabel, followupState, money, timeAgo, todayKey } from "@/lib/format";
import { Card, CardHeader, LinkButton, StatusBadge, btn, inputCls, isMissingTable } from "@/components/ui-kit";
import { LeadFields } from "../lead-fields";
import { ContactActions, type ContactItem } from "./contact-actions";
import { SiteAuditCard, type SiteAudit } from "./site-audit-card";
import { mailtoLink, renderTemplate, templateVars, whatsappLink } from "@/lib/templates";
import { addNote, changeStatusForm, clearFollowup, deleteLead, setFollowupForm, snoozeFollowup, updateLead } from "../actions";

export default function Page(props: PageProps<"/prospectos/[id]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
      <Detail params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Detail({
  params,
  searchParams,
}: {
  params: PageProps<"/prospectos/[id]">["params"];
  searchParams: PageProps<"/prospectos/[id]">["searchParams"];
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: lead }, { data: events }, { data: client }, { data: templates }, auditRes] = await Promise.all([
    supabase.from("leads").select("*, sources(name)").eq("id", id).maybeSingle(),
    supabase.from("lead_events").select("id, type, payload, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("clients").select("id").eq("lead_id", id).maybeSingle(),
    // Si la migración 0008 no está aplicada devuelve error y simplemente no se muestran plantillas
    supabase.from("message_templates").select("id, name, channel, subject, body, is_default").eq("active", true).order("is_default", { ascending: false }).order("created_at"),
    // Última revisión del sitio web (si falta la migración 0011 devuelve error y se muestra el aviso)
    supabase.from("site_audits").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (!lead) notFound();

  const audit = (auditRes.data as SiteAudit | null) ?? null;
  const vars = templateVars(lead, undefined, audit?.status === "done" ? audit.headline : null);
  const contactItems: ContactItem[] = (templates ?? []).flatMap((t): ContactItem[] => {
    const body = renderTemplate(t.body, vars);
    if (t.channel === "whatsapp") {
      const href = whatsappLink(lead.phone, body);
      return href ? [{ id: t.id, name: t.name, channel: "whatsapp", href, preview: body, isDefault: t.is_default }] : [];
    }
    if (t.channel === "email" && lead.email) {
      const subject = renderTemplate(t.subject ?? "", vars);
      return [{ id: t.id, name: t.name, channel: "email", href: mailtoLink(lead.email, subject, body), preview: `Asunto: ${subject}

${body}`, isDefault: t.is_default }];
    }
    return [];
  });

  const status = lead.status as LeadStatus;
  const open = !["won", "lost"].includes(status);

  return (
    <div className="space-y-6">
      <Link href="/prospectos" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Prospectos
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight">{lead.name}</h1>
            <StatusBadge status={lead.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {lead.company ?? "Sin empresa"} · {(lead.sources as { name?: string } | null)?.name ?? "Manual"} · creado {timeAgo(lead.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/cotizaciones/nueva?lead=${lead.id}`}>
            <FileText className="size-4" /> Crear cotización
          </LinkButton>
          {client && (
            <LinkButton href={`/clientes/${client.id}`} variant="outline">
              Ver cliente
            </LinkButton>
          )}
        </div>
      </div>

      {typeof error === "string" && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Datos del prospecto" />
            <form action={updateLead.bind(null, lead.id)} className="space-y-5 p-5">
              <LeadFields d={lead} withDealValue />
              <button className={btn.primary}>Guardar cambios</button>
            </form>
          </Card>

          <SiteAuditCard leadId={lead.id} website={lead.website} audit={audit} tableMissing={isMissingTable(auditRes.error)} />

          <Card>
            <CardHeader title="Bitácora" hint="Cambios de estado y notas" />
            <form action={addNote.bind(null, lead.id)} className="flex gap-2 border-b p-4">
              <input name="note" placeholder="Agrega una nota (llamada, acuerdo, siguiente paso…)" className={inputCls} />
              <button className={btn.outline}>Añadir</button>
            </form>
            <ul className="divide-y">
              {(events ?? []).map((e) => (
                <li key={e.id} className="flex gap-3 px-5 py-3 text-sm">
                  {(() => {
                    const { Icon, text } = describe(e);
                    return (
                      <>
                        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p>{text}</p>
                          <p className="text-xs text-muted-foreground">{dateTime(e.created_at)}</p>
                        </div>
                      </>
                    );
                  })()}
                </li>
              ))}
              {!events?.length && <li className="px-5 py-6 text-center text-sm text-muted-foreground">Sin movimientos todavía.</li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Contactar" hint="Abre el mensaje ya escrito; solo pulsa enviar" />
            {contactItems.length ? (
              <ContactActions leadId={lead.id} items={contactItems} />
            ) : (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                {lead.phone || lead.email ? "Sin plantillas activas. Crea una en " : "Este prospecto no tiene teléfono ni correo. "}
                {(lead.phone || lead.email) && <Link href="/plantillas" className="font-semibold text-primary hover:underline">Plantillas</Link>}
              </p>
            )}
          </Card>

          <Card>
            <CardHeader title="Mover de etapa" />
            <div className="space-y-3 p-5">
              <div className="flex flex-wrap gap-2">
                {LEAD_STATUSES.filter((s) => !["won", "lost"].includes(s)).map((s) => (
                  <form key={s} action={changeStatusForm.bind(null, lead.id, s as LeadStatus)}>
                    <button
                      disabled={s === status}
                      className={`${btn.outline} px-3 py-1.5 text-xs ${s === status ? "ring-2 ring-primary" : ""}`}
                    >
                      {STATUS_LABEL[s as LeadStatus]}
                    </button>
                  </form>
                ))}
              </div>

              <form action={changeStatusForm.bind(null, lead.id, "won")} className="space-y-2 rounded-xl bg-emerald-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <Trophy className="size-3.5" /> Se concretó
                </p>
                <input name="deal_value" type="number" step="0.01" min={0} defaultValue={lead.deal_value ?? ""} placeholder="Valor del trato (opcional)" className={inputCls} />
                <button disabled={status === "won"} className={`${btn.primary} w-full bg-emerald-600`}>
                  {status === "won" ? "Ya está ganado" : "Marcar como ganado"}
                </button>
                {open && <p className="text-[11px] text-emerald-800/80">Se crea el cliente para seguir su proyecto.</p>}
              </form>

              <form action={changeStatusForm.bind(null, lead.id, "lost")} className="space-y-2 rounded-xl bg-rose-50 p-3">
                <p className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                  <XCircle className="size-3.5" /> No se concretó
                </p>
                <input name="lost_reason" defaultValue={lead.lost_reason ?? ""} placeholder="Motivo (precio, sin respuesta…)" className={inputCls} />
                <button disabled={status === "lost"} className={`${btn.danger} w-full`}>
                  {status === "lost" ? "Ya está perdido" : "Marcar como perdido"}
                </button>
              </form>
            </div>
          </Card>

          <Card>
            <CardHeader title="Seguimiento" hint="Cuándo volver a contactarlo" />
            <div className="space-y-3 p-5">
              {lead.next_followup ? (
                <p className={`text-sm font-semibold ${followupState(lead.next_followup) === "overdue" ? "text-rose-600" : followupState(lead.next_followup) === "today" ? "text-amber-600" : ""}`}>
                  {followupState(lead.next_followup) === "overdue" ? "Vencido · " : followupState(lead.next_followup) === "today" ? "Hoy · " : "Programado · "}
                  {dayLabel(lead.next_followup)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Sin seguimiento programado.</p>
              )}
              {open && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {[[1, "Mañana"], [3, "En 3 días"], [7, "En 1 semana"]].map(([d, label]) => (
                      <form key={d} action={snoozeFollowup.bind(null, lead.id, d as number)}>
                        <button className={`${btn.outline} px-3 py-1.5 text-xs`}>{label}</button>
                      </form>
                    ))}
                  </div>
                  <form action={setFollowupForm.bind(null, lead.id)} className="flex gap-2">
                    <input name="date" type="date" min={todayKey()} defaultValue={lead.next_followup ?? ""} className={inputCls} aria-label="Fecha de seguimiento" />
                    <button className={btn.outline}>Fijar</button>
                  </form>
                  {lead.next_followup && (
                    <form action={clearFollowup.bind(null, lead.id)}>
                      <button className="text-xs font-semibold text-muted-foreground hover:underline">Quitar seguimiento</button>
                    </form>
                  )}
                </>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Resumen" />
            <dl className="space-y-2.5 p-5 text-sm">
              <Row label="Score" value={String(lead.score)} />
              <Row label="Valor del trato" value={lead.deal_value != null ? money(lead.deal_value) : "—"} />
              <Row label="Cerrado" value={lead.closed_at ? dateTime(lead.closed_at) : "—"} />
              {lead.lost_reason && <Row label="Motivo" value={lead.lost_reason} />}
              {lead.address && <Row label="Dirección" value={lead.address} />}
            </dl>
            {lead.lat != null && lead.lng != null && (
              <div className="flex gap-3 border-t px-5 py-3 text-xs font-semibold">
                <a href={`https://www.google.com/maps/dir/?api=1&destination=${lead.lat},${lead.lng}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  Cómo llegar
                </a>
                <Link href="/mapa" className="text-primary hover:underline">
                  Ver en el mapa
                </Link>
              </div>
            )}
          </Card>

          <form action={deleteLead.bind(null, lead.id)}>
            <button className={`${btn.ghost} text-rose-600 hover:text-rose-700`}>Eliminar prospecto</button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

function describe(e: { type: string; payload: Record<string, unknown> }): { Icon: LucideIcon; text: string } {
  if (e.type === "created") return { Icon: Sparkles, text: "Prospecto creado" };
  if (e.type === "note") return { Icon: StickyNote, text: String(e.payload.text ?? "") };
  if (e.type === "contact") {
    const email = e.payload.channel === "email";
    return { Icon: email ? Mail : MessageCircle, text: `Contactado por ${email ? "correo" : "WhatsApp"} (${String(e.payload.template ?? "plantilla")})` };
  }
  if (e.type === "status_change") {
    const from = STATUS_LABEL[e.payload.from as LeadStatus] ?? String(e.payload.from);
    const to = STATUS_LABEL[e.payload.to as LeadStatus] ?? String(e.payload.to);
    return { Icon: ArrowRightLeft, text: `Cambió de ${from} a ${to}` };
  }
  return { Icon: StickyNote, text: e.type };
}
