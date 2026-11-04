import { Suspense } from "react";
import { connection } from "next/server";
import { dbRows } from "@/lib/db";
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
  // Lectura en cada petición (antes lo marcaba createClient con las cookies)
  await connection();
  // Los cerrados antiguos no se muestran para no saturar el tablero.
  const since = new Date(nowMs() - 60 * 24 * 3600 * 1000).toISOString();
  const { data } = await dbRows(
    "select id, name, company, score, status, deal_value, closed_at from leads where (closed_at is null or closed_at >= $1) order by score desc limit 500",
    [since]
  );

  return <Kanban initial={(data ?? []) as KanbanLead[]} />;
}
