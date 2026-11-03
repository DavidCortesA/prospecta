"use client";

import dynamic from "next/dynamic";
import type { MapLead } from "./lead-map";

// Leaflet necesita `window`, así que solo se carga en el navegador.
const LeadMap = dynamic(() => import("./lead-map").then((m) => m.LeadMap), {
  ssr: false,
  loading: () => <div className="h-[62vh] animate-pulse rounded-2xl bg-secondary" />,
});

export function MapLoader({ leads, today }: { leads: MapLead[]; today: string }) {
  return <LeadMap leads={leads} today={today} />;
}
