import { Suspense } from "react";
import { createClient } from "@/lib/server";
import { nowMs } from "@/lib/format";
import { MigrationNotice, PageHeader, isMissingTable } from "@/components/ui-kit";
import { QuoteBuilder, type CatalogFeature } from "../quote-builder";

export const metadata = { title: "Nueva cotización" };

export default function Page(props: PageProps<"/cotizaciones/nueva">) {
  return (
    <>
      <PageHeader title="Nueva cotización" subtitle="Elige las features y el total se calcula solo." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <Builder searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Builder({ searchParams }: { searchParams: PageProps<"/cotizaciones/nueva">["searchParams"] }) {
  const sp = await searchParams;
  const leadId = typeof sp.lead === "string" ? sp.lead : null;
  const clientId = typeof sp.client === "string" ? sp.client : null;

  const supabase = await createClient();
  const { data: features, error } = await supabase
    .from("features")
    .select("id, name, description, category, price")
    .eq("active", true)
    .order("category")
    .order("name");

  if (isMissingTable(error)) return <MigrationNotice file="0004_catalog_quotes.sql" />;

  let who = { name: "", company: "", email: "" };
  if (leadId) {
    const { data } = await supabase.from("leads").select("name, company, email").eq("id", leadId).maybeSingle();
    if (data) who = { name: data.name, company: data.company ?? "", email: data.email ?? "" };
  } else if (clientId) {
    const { data } = await supabase.from("clients").select("name, company, email").eq("id", clientId).maybeSingle();
    if (data) who = { name: data.name, company: data.company ?? "", email: data.email ?? "" };
  }

  const valid = new Date(nowMs() + 15 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <QuoteBuilder
      features={(features ?? []) as CatalogFeature[]}
      defaults={{
        title: who.company ? `Propuesta para ${who.company}` : "Propuesta de desarrollo",
        lead_id: leadId,
        client_id: clientId,
        customer_name: who.name,
        customer_company: who.company,
        customer_email: who.email,
        valid_until: valid,
      }}
    />
  );
}
