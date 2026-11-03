// Catálogos y armado de fuentes para DENUE (INEGI). Sin dependencias para poder probarlo desde el worker.
// Los códigos de municipio y de giro se validaron contra la API real de DENUE.

export const DENUE_ENTIDAD_NL = "19";

/** Clave INEGI de municipio de Nuevo León -> nombre */
export const DENUE_MUNICIPIOS: Record<string, string> = {
  "001": "Abasolo", "002": "Agualeguas", "003": "Los Aldamas", "004": "Allende", "005": "Anáhuac",
  "006": "Apodaca", "007": "Aramberri", "008": "Bustamante", "009": "Cadereyta Jiménez", "010": "El Carmen",
  "011": "Cerralvo", "012": "Ciénega de Flores", "013": "China", "014": "Doctor Arroyo", "015": "Doctor Coss",
  "016": "Doctor González", "017": "Galeana", "018": "García", "019": "San Pedro Garza García", "020": "General Bravo",
  "021": "General Escobedo", "022": "General Terán", "023": "General Treviño", "024": "General Zaragoza", "025": "General Zuazua",
  "026": "Guadalupe", "027": "Los Herreras", "028": "Higueras", "029": "Hualahuises", "030": "Iturbide",
  "031": "Juárez", "032": "Lampazos de Naranjo", "033": "Linares", "034": "Marín", "035": "Melchor Ocampo",
  "036": "Mier y Noriega", "037": "Mina", "038": "Montemorelos", "039": "Monterrey", "040": "Parás",
  "041": "Pesquería", "042": "Los Ramones", "043": "Rayones", "044": "Sabinas Hidalgo", "045": "Salinas Victoria",
  "046": "San Nicolás de los Garza", "047": "Hidalgo", "048": "Santa Catarina", "049": "Santiago", "050": "Vallecillo",
  "051": "Villaldama",
};

/** Zona metropolitana primero, el resto en orden alfabético */
export const DENUE_MUNICIPIOS_ORDER: string[] = (() => {
  const metro = ["039", "019", "046", "026", "048", "021", "006", "031", "018", "012", "041", "045", "025", "049"];
  const rest = Object.keys(DENUE_MUNICIPIOS)
    .filter((c) => !metro.includes(c))
    .sort((a, b) => DENUE_MUNICIPIOS[a].localeCompare(DENUE_MUNICIPIOS[b], "es"));
  return [...metro, ...rest];
})();

/** Clase de actividad SCIAN -> etiqueta corta. Tomar la clase (no una palabra) trae TODO el giro. */
export const DENUE_GIROS: { code: string; label: string }[] = [
  { code: "621211", label: "Dentistas (consultorios dentales)" },
  { code: "621111", label: "Médicos generales" },
  { code: "541941", label: "Veterinarias" },
  { code: "722511", label: "Restaurantes" },
  { code: "812110", label: "Salones de belleza y peluquerías" },
  { code: "713943", label: "Gimnasios" },
  { code: "541110", label: "Abogados (bufetes jurídicos)" },
  { code: "541211", label: "Contadores" },
  { code: "531210", label: "Inmobiliarias" },
  { code: "811111", label: "Talleres mecánicos" },
  { code: "464111", label: "Farmacias" },
  { code: "467111", label: "Ferreterías" },
  { code: "461110", label: "Tiendas de abarrotes" },
  { code: "611111", label: "Escuelas de preescolar privadas" },
  { code: "721111", label: "Hoteles" },
];

export const CRON_PRESETS: { value: string; label: string }[] = [
  { value: "0 9 * * *", label: "Todos los días a las 9:00" },
  { value: "0 */3 * * *", label: "Cada 3 horas" },
  { value: "0 */6 * * *", label: "Cada 6 horas" },
  { value: "0 9 * * 1", label: "Los lunes a las 9:00" },
];

export type DenueInput = {
  /** código SCIAN de DENUE_GIROS, o vacío si se usa palabra clave */
  giro?: string;
  /** palabra(s) clave en el nombre del negocio, si no se elige giro */
  keyword?: string;
  /** clave de municipio de DENUE_MUNICIPIOS; vacío = todo Nuevo León */
  municipio?: string;
  onlyNoWebsite: boolean;
  onlyContactable: boolean;
  pageSize: number;
  cron: string;
};

const BASE = "https://www.inegi.org.mx/app/api/denue/v1/consulta";

/** Devuelve nombre, URL (con {{from}}/{{to}} y el token como {{env.DENUE_TOKEN}}) y config listos para insertar en `sources`. */
export function buildDenueSource(input: DenueInput) {
  const giro = DENUE_GIROS.find((g) => g.code === input.giro);
  const keyword = (input.keyword ?? "").trim().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (!giro && !keyword) throw new Error("Elige un giro o escribe una palabra clave");

  const municipio = input.municipio && DENUE_MUNICIPIOS[input.municipio] ? input.municipio : "";
  // INEGI responde 404 si se pide una clase de actividad en todo el estado: con giro hace falta un municipio.
  if (giro && !municipio) throw new Error("Para un giro elige un municipio (INEGI no permite buscar un giro en todo Nuevo León). Para todo el estado usa una palabra clave.");
  const clase = giro ? giro.code : "0";
  // En DENUE varias palabras van separadas por comas; "0" significa "sin filtro"
  const nombre = !giro && keyword ? encodeURIComponent(keyword).replace(/%20/g, ",") : "0";

  const url =
    `${BASE}/BuscarAreaAct/${DENUE_ENTIDAD_NL}/${municipio || "0"}/0/0/0/0/0/0/${clase}/${nombre}` +
    `/{{from}}/{{to}}/0/{{env.DENUE_TOKEN}}`;

  const filter: Record<string, string[]> = {};
  if (input.onlyContactable) filter.requireAny = ["email", "phone"];
  if (input.onlyNoWebsite) filter.missing = ["website"];

  const config = {
    pageSize: Math.min(200, Math.max(10, input.pageSize || 50)),
    ...(Object.keys(filter).length ? { filter } : {}),
    map: {
      external_id: "Id",
      name: "Nombre",
      company: "Razon_social",
      email: "Correo_e",
      phone: "Telefono",
      website: "Sitio_internet",
      city: "Ubicacion",
      notes: "Clase_actividad",
      lat: "Latitud",
      lng: "Longitud",
      address: "{Tipo_vialidad} {Calle} {Num_Exterior}, {Colonia}, C.P. {CP}",
    },
  };

  const name = `DENUE · ${giro ? giro.label : keyword} · ${municipio ? DENUE_MUNICIPIOS[municipio] : "Nuevo León"}`;
  return { name, url, config, cron: input.cron };
}
