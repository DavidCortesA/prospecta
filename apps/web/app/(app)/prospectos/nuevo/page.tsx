import { Suspense } from "react";
import { createLead } from "../actions";
import { LeadFields } from "../lead-fields";
import { Card, LinkButton, PageHeader, btn } from "@/components/ui-kit";

export const metadata = { title: "Nuevo prospecto" };

export default function Page(props: PageProps<"/prospectos/nuevo">) {
  return (
    <>
      <PageHeader title="Nuevo prospecto" subtitle="Agrega un contacto manualmente." />
      <Card className="max-w-3xl p-6">
        <Suspense>
          <ErrorBanner searchParams={props.searchParams} />
        </Suspense>
        <form action={createLead} className="space-y-6">
          <LeadFields />
          <div className="flex gap-2">
            <button className={btn.primary}>Guardar prospecto</button>
            <LinkButton href="/prospectos" variant="outline">
              Cancelar
            </LinkButton>
          </div>
        </form>
      </Card>
    </>
  );
}

async function ErrorBanner({ searchParams }: { searchParams: PageProps<"/prospectos/nuevo">["searchParams"] }) {
  const { error } = await searchParams;
  if (typeof error !== "string") return null;
  return <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>;
}
