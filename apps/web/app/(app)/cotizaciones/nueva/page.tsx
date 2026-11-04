import { Suspense } from "react";
import { dbRow, dbRows } from "@/lib/db";
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

  const { data: features, error } = await dbRows(
    "select id, name, description, category, price from features where active = true order by category, name"
  );

  if (isMissingTable(error)) return <MigrationNotice file="0004_catalog_quotes.sql" />;

  let who = { name: "", company: "", email: "" };
  if (leadId) {
    const { data } = await dbRow<{ name: string; company: string | null; email: string | null }>("select name, company, email from leads where id = $1", [leadId]);
    if (data) who = { name: data.name, company: data.company ?? "", email: data.email ?? "" };
  } else if (clientId) {
    const { data } = await dbRow<{ name: string; company: string | null; email: string | null }>("select name, company, email from clients where id = $1", [clientId]);
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
