import { Suspense } from "react";
import { createClient } from "@/lib/server";
import { nowMs } from "@/lib/format";
import { PageHeader } from "@/components/ui-kit";
import { Kanban, type KanbanLead } from "./kanban";

export const metadata = { title: "Pipeline" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Arrastra cada prospecto entre etapas. Los cambios se guardan al instante." />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-secondary" />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  const supabase = await createClient();
  // Los cerrados antiguos no se muestran para no saturar el tablero.
  const since = new Date(nowMs() - 60 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from("leads")
    .select("id, name, company, score, status, deal_value, closed_at")
    .or(`closed_at.is.null,closed_at.gte.${since}`)
    .order("score", { ascending: false })
    .limit(500);

  return <Kanban initial={(data ?? []) as KanbanLead[]} />;
}
