import { Suspense } from "react";
import { connection } from "next/server";
import { dbRow, dbRows } from "@/lib/db";
import { todayKey } from "@/lib/format";
import { Card, EmptyState, MigrationNotice, PageHeader, isMissingColumn } from "@/components/ui-kit";
import type { LeadStatus } from "@/lib/constants";
import { MapLoader } from "./map-loader";
import type { MapLead } from "./lead-map";

export const metadata = { title: "Mapa" };

export default function Page() {
  return (
    <>
      <PageHeader title="Mapa" subtitle="Dónde están tus prospectos. Filtra por zona, planea una ruta de visitas y ábrela en Google Maps." />
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-secondary" />}>
        <MapView />
      </Suspense>
    </>
  );
}

async function MapView() {
  // Lectura en cada petición (antes lo marcaba createClient con las cookies)
  await connection();
  const [located, missing] = await Promise.all([
    dbRows(
      "select id, name, company, phone, website, status, score, city, address, lat, lng, next_followup from leads where lat is not null and lng is not null limit 5000"
    ),
    dbRow<{ n: number }>("select count(*)::int as n from leads where lat is null"),
  ]);
  const missingCount = missing.data?.n;

  if (isMissingColumn(located.error)) return <MigrationNotice file="0010_lead_location.sql" />;

  const leads = (located.data ?? []) as unknown as (Omit<MapLead, "status"> & { status: LeadStatus })[];

  if (!leads.length) {
    return (
      <Card>
        <EmptyState
          title="Aún no hay prospectos con ubicación"
          text="Las fuentes DENUE guardan la dirección y las coordenadas de cada negocio. En Fuentes, pulsa «Reiniciar» en tu fuente DENUE y luego «Ejecutar ahora» para completar la ubicación de los prospectos que ya tienes."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <MapLoader leads={leads} today={todayKey()} />
      {!!missingCount && (
        <p className="text-xs text-muted-foreground">
          {missingCount} {missingCount === 1 ? "prospecto no tiene" : "prospectos no tienen"} ubicación y no aparecen en el mapa.
        </p>
      )}
    </div>
  );
}
