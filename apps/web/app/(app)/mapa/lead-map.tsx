"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { Crosshair, FileText, MapPin, MessageCircle, Navigation, Phone, Route as RouteIcon } from "lucide-react";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { cityName, whatsappNumber } from "@/lib/templates";
import { btn, inputCls } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

export type MapLead = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  website: string | null;
  status: LeadStatus;
  score: number;
  city: string | null;
  address: string | null;
  lat: number;
  lng: number;
  next_followup: string | null;
};

const COLORS: Record<LeadStatus, string> = {
  new: "#0ea5e9",
  contacted: "#f59e0b",
  replied: "#8b5cf6",
  qualified: "#14b8a6",
  won: "#10b981",
  lost: "#f43f5e",
};

/** Estados con los que todavía hay algo que hacer (para visitas y rutas) */
const OPEN: LeadStatus[] = ["new", "contacted", "replied", "qualified"];

const MONTERREY: L.LatLngTuple = [25.6866, -100.3161];

const gmapsDir = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/** Contenido del popup de un punto. Es React (los textos se escapan solos) con íconos Lucide. */
function LeadPopup({ l }: { l: MapLead }) {
  const wa = whatsappNumber(l.phone);
  // Leaflet pinta de azul los <a> dentro del mapa; se fuerza el color de la marca
  const link = { color: "var(--primary)" };
  const row = "mb-1 flex gap-1.5 text-xs";
  return (
    <div className="min-w-52 font-sans">
      <div className="text-sm font-bold leading-snug">{l.name}</div>
      {l.company && l.company !== l.name && <div className="text-xs text-muted-foreground">{l.company}</div>}
      <div className="my-1.5 flex items-center gap-1.5 text-xs">
        <span className="size-2 rounded-full" style={{ background: COLORS[l.status] }} />
        {STATUS_LABEL[l.status]} · score {l.score}
      </div>
      {l.address && (
        <div className={row}>
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          {l.address}
        </div>
      )}
      {l.phone && (
        <div className={`${row} mb-2`}>
          <Phone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          {l.phone}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
        <a style={link} className="inline-flex items-center gap-1" href={`/prospectos/${l.id}`}>
          <FileText className="size-3.5" /> Ficha
        </a>
        {wa && (
          <a style={link} className="inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${wa}`}>
            <MessageCircle className="size-3.5" /> WhatsApp
          </a>
        )}
        <a style={link} className="inline-flex items-center gap-1" target="_blank" rel="noopener noreferrer" href={gmapsDir(l.lat, l.lng)}>
          <Navigation className="size-3.5" /> Cómo llegar
        </a>
      </div>
    </div>
  );
}

export function LeadMap({ leads, today }: { leads: MapLead[]; today: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const fitKey = useRef<string>("");
  const popupRoots = useRef<Map<string, Root>>(new Map());

  const closePopups = () => {
    const roots = [...popupRoots.current.values()];
    popupRoots.current.clear();
    // se desmonta fuera del render actual para evitar avisos de React
    setTimeout(() => roots.forEach((r) => r.unmount()), 0);
  };

  const [statuses, setStatuses] = useState<Set<LeadStatus>>(new Set(OPEN));
  const [municipio, setMunicipio] = useState("");
  const [q, setQ] = useState("");
  const [onlyNoWeb, setOnlyNoWeb] = useState(false);
  const [onlyDue, setOnlyDue] = useState(false);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [route, setRoute] = useState<{ stops: MapLead[]; url: string } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const withMunicipio = useMemo(() => leads.map((l) => ({ ...l, municipio: cityName(l.city) || "Sin municipio" })), [leads]);

  const municipios = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of withMunicipio) counts.set(l.municipio, (counts.get(l.municipio) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [withMunicipio]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return withMunicipio.filter(
      (l) =>
        statuses.has(l.status) &&
        (!municipio || l.municipio === municipio) &&
        (!onlyNoWeb || !l.website) &&
        (!onlyDue || (!!l.next_followup && l.next_followup <= today)) &&
        (!term || `${l.name} ${l.company ?? ""} ${l.address ?? ""}`.toLowerCase().includes(term))
    );
  }, [withMunicipio, statuses, municipio, q, onlyNoWeb, onlyDue, today]);

  // Crear el mapa una sola vez
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { preferCanvas: true, zoomControl: true }).setView(MONTERREY, 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      closePopups();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Dibujar los puntos visibles
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    closePopups();
    layer.clearLayers();
    markersRef.current.clear();

    for (const l of visible) {
      const m = L.circleMarker([l.lat, l.lng], {
        radius: 7,
        color: "#ffffff",
        weight: 1.5,
        fillColor: COLORS[l.status],
        fillOpacity: 0.9,
      })
        .bindPopup(
          () => {
            // El contenido se crea al abrir el popup (no para los miles de puntos) y se pinta de forma síncrona
            const el = document.createElement("div");
            const root = createRoot(el);
            flushSync(() => root.render(<LeadPopup l={l} />));
            popupRoots.current.set(l.id, root);
            return el;
          },
          { minWidth: 220 }
        )
        .on("popupclose", () => {
          const root = popupRoots.current.get(l.id);
          if (!root) return;
          popupRoots.current.delete(l.id);
          setTimeout(() => root.unmount(), 0);
        });
      m.addTo(layer);
      markersRef.current.set(l.id, m);
    }

    // Encuadrar solo cuando cambia el municipio (o la primera vez), no en cada filtro
    const key = municipio || "all";
    if (visible.length && fitKey.current !== key) {
      fitKey.current = key;
      map.fitBounds(L.latLngBounds(visible.map((l) => [l.lat, l.lng] as L.LatLngTuple)).pad(0.1), { maxZoom: 15 });
    }
    setRoute(null);
  }, [visible, municipio]);

  const toggleStatus = (s: LeadStatus) =>
    setStatuses((cur) => {
      const next = new Set(cur);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });

  function focusLead(l: MapLead) {
    const map = mapRef.current;
    const marker = markersRef.current.get(l.id);
    if (!map || !marker) return;
    map.setView([l.lat, l.lng], Math.max(map.getZoom(), 15));
    marker.openPopup();
  }

  function locateMe() {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError("Tu navegador no permite ubicación");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(p);
        mapRef.current?.setView([p.lat, p.lng], 14);
      },
      () => setGeoError("No se pudo obtener tu ubicación (revisa el permiso del navegador)"),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  /** Hasta 9 paradas: del punto de partida se va siempre al prospecto abierto más cercano. */
  function planRoute() {
    const map = mapRef.current;
    if (!map) return;
    const bounds = map.getBounds();
    let pool = visible.filter((l) => OPEN.includes(l.status) && bounds.contains([l.lat, l.lng]));
    let from: L.LatLngTuple = me ? [me.lat, me.lng] : [map.getCenter().lat, map.getCenter().lng];
    const stops: MapLead[] = [];
    while (stops.length < 9 && pool.length) {
      let best = pool[0];
      let bestD = Infinity;
      for (const l of pool) {
        const d = map.distance(from, [l.lat, l.lng]);
        if (d < bestD) {
          bestD = d;
          best = l;
        }
      }
      stops.push(best);
      from = [best.lat, best.lng];
      pool = pool.filter((l) => l.id !== best.id);
    }
    if (!stops.length) return setRoute(null);
    const last = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1).map((l) => `${l.lat},${l.lng}`).join("|");
    const url =
      `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${last.lat},${last.lng}` +
      (waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : "") +
      (me ? `&origin=${me.lat},${me.lng}` : "");
    setRoute({ stops, url });
  }

  const list = useMemo(() => [...visible].sort((a, b) => b.score - a.score).slice(0, 40), [visible]);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {LEAD_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition",
                statuses.has(s) ? "bg-sidebar text-sidebar-accent-foreground ring-sidebar" : "bg-card text-muted-foreground ring-border hover:text-foreground"
              )}
            >
              <span className="size-2.5 rounded-full" style={{ background: COLORS[s] }} />
              {STATUS_LABEL[s]} <span className="opacity-60">{statusCounts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={inputCls} aria-label="Zona o municipio">
            <option value="">Todas las zonas</option>
            {municipios.map(([m, n]) => (
              <option key={m} value={m}>
                {m} ({n})
              </option>
            ))}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, colonia o calle" className={inputCls} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyNoWeb} onChange={(e) => setOnlyNoWeb(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Solo sin sitio web
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Solo con seguimiento hoy o vencido
          </label>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="relative overflow-hidden rounded-2xl border shadow-sm">
          <div ref={containerRef} className="z-0 h-[62vh] min-h-96 w-full bg-secondary" />
          <div className="absolute right-3 top-3 z-[400] flex flex-col gap-2">
            <button type="button" onClick={locateMe} className={`${btn.outline} bg-card px-3 py-1.5 text-xs shadow-md`}>
              <Crosshair className="size-3.5" /> Mi ubicación
            </button>
          </div>
          <p className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-full bg-card/90 px-3 py-1 text-xs font-semibold shadow">
            {visible.length} en el mapa
          </p>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 shadow-sm">
            <p className="text-sm font-bold">Ruta de visitas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Arma una ruta con hasta 9 prospectos abiertos, los más cercanos {me ? "a tu ubicación" : "al centro del mapa"}, y la abre en Google Maps.
            </p>
            <button type="button" onClick={planRoute} className={`${btn.primary} mt-3 w-full`}>
              <RouteIcon className="size-4" /> Planear ruta aquí
            </button>
            {geoError && <p className="mt-2 text-xs text-rose-600">{geoError}</p>}
            {route && (
              <div className="mt-3 space-y-2">
                <ol className="space-y-1 text-xs">
                  {route.stops.map((l, i) => (
                    <li key={l.id} className="flex gap-2">
                      <span className="font-bold text-primary">{i + 1}.</span>
                      <span className="truncate">{l.name}</span>
                    </li>
                  ))}
                </ol>
                <a href={route.url} target="_blank" rel="noopener noreferrer" className={`${btn.outline} w-full`}>
                  Abrir en Google Maps
                </a>
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card shadow-sm">
            <p className="border-b px-4 py-3 text-sm font-bold">Mejores prospectos en el mapa</p>
            {list.length ? (
              <ul className="max-h-96 divide-y overflow-y-auto">
                {list.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => focusLead(l)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-secondary/60">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[l.status] }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{l.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{l.address ?? l.city ?? ""}</span>
                      </span>
                      <span className="text-xs font-bold text-muted-foreground">{l.score}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nada con esos filtros.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
