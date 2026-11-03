import { Suspense } from "react";
import { createClient } from "@/lib/server";
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
  const supabase = await createClient();

  const [located, missing] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, company, phone, website, status, score, city, address, lat, lng, next_followup")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .limit(5000),
    supabase.from("leads").select("*", { count: "exact", head: true }).is("lat", null),
  ]);

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
      {!!missing.count && (
        <p className="text-xs text-muted-foreground">
          {missing.count} {missing.count === 1 ? "prospecto no tiene" : "prospectos no tienen"} ubicación y no aparecen en el mapa.
        </p>
      )}
    </div>
  );
}
