import { chromium, type Browser } from "playwright";
import { config } from "../config.js";
import { checkRobots } from "../collectors/robots.js";
import { assertPublicUrl, normalizeWebsite } from "./ssrf.js";

export type Severity = "high" | "medium" | "low";
export type Issue = { code: string; severity: Severity; title: string; detail: string; pitch: string };

export type AuditResult = {
  finalUrl: string;
  score: number;
  headline: string;
  metrics: Record<string, unknown>;
  issues: Issue[];
  screenshot: string | null;
};

/** Error "esperado" (el sitio no se puede o no se debe revisar): se muestra tal cual al usuario. */
export class AuditError extends Error {}

type Options = {
  /** SOLO para pruebas con un servidor local. Nunca se activa desde el worker. */
  allowPrivate?: boolean;
};

type Visit = {
  status: number | null;
  finalUrl: string;
  loadError: string | null;
  certError: boolean;
  requests: number;
  bytes: number;
  mixed: number;
  blocked: number;
  dom: DomMetrics | null;
  screenshot: string | null;
};

type DomMetrics = {
  ttfb: number | null;
  dcl: number | null;
  load: number | null;
  lcp: number;
  cls: number;
  viewport: string | null;
  scrollWidth: number;
  innerWidth: number;
  title: string;
  description: string | null;
  h1: number;
  lang: string;
  imgCount: number;
  imgNoAlt: number;
  hasTel: boolean;
  hasWhatsapp: boolean;
  hasMail: boolean;
  hasForm: boolean;
  copyrightYear: number | null;
  generator: string | null;
  bodyFontPx: number;
  textLength: number;
};

const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";

const NAV_TIMEOUT_MS = 30_000;
const LOCAL_SCHEMES = ["data:", "blob:", "about:"];

export async function auditSite(rawUrl: string, options: Options = {}): Promise<AuditResult> {
  const started = Date.now();
  const url = normalizeWebsite(rawUrl);
  if (!url) throw new AuditError("El prospecto no tiene un sitio web válido");

  if (!options.allowPrivate) {
    try {
      await assertPublicUrl(url);
    } catch (e) {
      throw new AuditError(`No se puede revisar este sitio: ${(e as Error).message}`);
    }
    // Si robots.txt no se puede consultar (sitio caído) se sigue: el navegador lo reportará como "no carga".
    if ((await checkRobots(url)) === "disallowed") {
      throw new AuditError("El robots.txt del sitio no permite revisiones automáticas, así que no se revisó");
    }
  }

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.CHROMIUM_CHANNEL || undefined, // solo para desarrollo local (p. ej. "msedge")
    args: ["--disable-dev-shm-usage"],
  });
  try {
    let certError = false;
    let visit = await visitPage(browser, url, false, options);
    if (visit.certError) {
      // Certificado inválido: se anota como hallazgo y se vuelve a abrir ignorándolo para revisar el resto.
      certError = true;
      visit = await visitPage(browser, url, true, options);
    }
    const analyzed = analyze(url, visit, certError);
    return { ...analyzed, metrics: { ...analyzed.metrics, durationMs: Date.now() - started } };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function visitPage(browser: Browser, url: string, ignoreHttpsErrors: boolean, options: Options): Promise<Visit> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: "es-MX",
    userAgent: `${MOBILE_UA} ${config.userAgent}`,
    ignoreHTTPSErrors: ignoreHttpsErrors,
    serviceWorkers: "block",
  });

  const visit: Visit = {
    status: null,
    finalUrl: url,
    loadError: null,
    certError: false,
    requests: 0,
    bytes: 0,
    mixed: 0,
    blocked: 0,
    dom: null,
    screenshot: null,
  };

  try {
    // Cada petición (incluidas redirecciones y recursos de terceros) debe ir a una dirección pública.
    await context.route("**/*", async (route) => {
      const req = route.request();
      const type = req.resourceType();
      if (type === "media" || type === "websocket") return route.abort();
      const target = req.url();
      if (!options.allowPrivate && !LOCAL_SCHEMES.some((s) => target.startsWith(s))) {
        try {
          await assertPublicUrl(target);
        } catch {
          visit.blocked++;
          return route.abort("blockedbyclient");
        }
      }
      return route.continue();
    });

    const page = await context.newPage();
    await page.addInitScript(() => {
      const w = window as unknown as { __m: { lcp: number; cls: number } };
      w.__m = { lcp: 0, cls: 0 };
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) w.__m.lcp = e.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as unknown as { hadRecentInput: boolean; value: number }[]) {
            if (!e.hadRecentInput) w.__m.cls += e.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        // el navegador no soporta estas métricas: se ignoran
      }
    });

    page.on("requestfinished", async (req) => {
      visit.requests++;
      if (url.startsWith("https:") && req.url().startsWith("http:")) visit.mixed++;
      try {
        const s = await req.sizes();
        visit.bytes += Math.max(0, s.responseBodySize) + Math.max(0, s.responseHeadersSize);
      } catch {
        // la petición se canceló: no cuenta
      }
    });

    try {
      const response = await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
      visit.status = response?.status() ?? null;
    } catch (e) {
      const msg = (e as Error).message;
      if (/ERR_CERT|SSL_ERROR|ERR_SSL/i.test(msg) && !ignoreHttpsErrors) {
        visit.certError = true;
        return visit;
      }
      visit.loadError = translateLoadError(msg);
      return visit;
    }

    await page.waitForTimeout(1500); // deja que terminen LCP y los cambios de diseño
    visit.finalUrl = page.url();
    visit.dom = await page.evaluate((): DomMetrics => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const body = document.body;
      const text = body?.innerText ?? "";
      const years = [...text.matchAll(/(?:©|copyright|derechos reservados)[^0-9]{0,30}((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi)].map((m) =>
        Number(m[2] ?? m[1])
      );
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href") ?? "");
      const imgs = [...document.images];
      const m = (window as unknown as { __m?: { lcp: number; cls: number } }).__m ?? { lcp: 0, cls: 0 };
      return {
        ttfb: nav ? Math.round(nav.responseStart) : null,
        dcl: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        load: nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd) : null,
        lcp: Math.round(m.lcp),
        cls: Math.round(m.cls * 1000) / 1000,
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        title: document.title.trim(),
        description: document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || null,
        h1: document.querySelectorAll("h1").length,
        lang: document.documentElement.lang,
        imgCount: imgs.length,
        imgNoAlt: imgs.filter((i) => !i.hasAttribute("alt")).length,
        hasTel: links.some((h) => /^tel:/i.test(h)),
        hasWhatsapp: links.some((h) => /wa\.me|api\.whatsapp\.com|whatsapp:/i.test(h)),
        hasMail: links.some((h) => /^mailto:/i.test(h)),
        hasForm: !!document.querySelector("form"),
        copyrightYear: years.length ? Math.max(...years) : null,
        generator: document.querySelector('meta[name="generator"]')?.getAttribute("content") ?? null,
        bodyFontPx: body ? parseFloat(getComputedStyle(body).fontSize) : 16,
        textLength: text.length,
      };
    });

    // Captura de lo que se ve al abrir en un celular (JPEG chico para guardarlo en la base)
    const shot = await page.screenshot({ type: "jpeg", quality: 55 });
    if (shot.length <= 180_000) visit.screenshot = `data:image/jpeg;base64,${shot.toString("base64")}`;
  } finally {
    await context.close().catch(() => {});
  }
  return visit;
}

function translateLoadError(msg: string): string {
  if (/ERR_NAME_NOT_RESOLVED/i.test(msg)) return "El dominio no existe o ya no está activo";
  if (/ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_EMPTY_RESPONSE/i.test(msg)) return "El servidor del sitio rechaza la conexión";
  if (/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|Timeout/i.test(msg)) return `El sitio tardó más de ${NAV_TIMEOUT_MS / 1000} s en responder`;
  if (/ERR_TOO_MANY_REDIRECTS/i.test(msg)) return "El sitio entra en un ciclo de redirecciones";
  if (/blockedbyclient/i.test(msg)) return "El sitio redirige a una dirección no permitida";
  return "El sitio no pudo abrirse";
}

const SEVERITY_PENALTY: Record<Severity, number> = { high: 25, medium: 12, low: 5 };
const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

function analyze(requestedUrl: string, v: Visit, certError: boolean): Omit<AuditResult, "metrics"> & { metrics: Record<string, unknown> } {
  const issues: Issue[] = [];
  const add = (code: string, severity: Severity, title: string, detail: string, pitch: string) =>
    issues.push({ code, severity, title, detail, pitch });
  const seconds = (ms: number) => (ms / 1000).toFixed(1).replace(".0", "");

  const finalUrl = v.finalUrl || requestedUrl;
  const https = finalUrl.startsWith("https:");
  const d = v.dom;

  if (certError) {
    add("bad_certificate", "high", "Certificado de seguridad inválido", "El certificado HTTPS está vencido o no corresponde al dominio; los navegadores muestran una advertencia de seguridad.",
      "los navegadores muestran una advertencia de seguridad al abrir su sitio (certificado inválido)");
  }

  const notLoading = v.loadError || (v.status !== null && v.status >= 400) || !d;
  if (notLoading) {
    const reason = v.loadError ?? (v.status ? `El servidor respondió con error ${v.status}` : "No se pudo leer la página");
    add("not_loading", "high", "El sitio no carga", reason, "su sitio web no abre");
  } else if (d) {
    if (!https) {
      add("no_https", "high", "Sin HTTPS", "El sitio no usa conexión segura; el navegador lo marca como «No seguro».",
        "su sitio aparece como «No seguro» en el navegador por no usar HTTPS");
    }
    if (!d.viewport) {
      add("no_viewport", "high", "No está adaptado a celular", "Falta la etiqueta viewport: en el teléfono se ve como una versión reducida de escritorio.",
        "su sitio no está adaptado a celulares");
    } else if (d.scrollWidth - d.innerWidth > 20) {
      add("horizontal_overflow", "medium", "Se desborda en celular", `El contenido mide ${d.scrollWidth}px en una pantalla de ${d.innerWidth}px: hay que desplazarse de lado.`,
        "su sitio se desborda en el celular y hay que mover la pantalla de lado");
    }

    const speedMs = d.lcp > 0 ? d.lcp : (d.load ?? 0);
    const label = d.lcp > 0 ? "El contenido principal tarda" : "La página termina de cargar en";
    if (d.lcp > 0 ? d.lcp > 4000 : speedMs > 7000) {
      add("slow", "high", "Carga muy lenta", `${label} ${seconds(speedMs)} s en un celular.`, `su sitio tarda ${seconds(speedMs)} s en cargar en celular`);
    } else if (d.lcp > 0 ? d.lcp > 2500 : speedMs > 4000) {
      add("slow", "medium", "Carga lenta", `${label} ${seconds(speedMs)} s en un celular (lo recomendable es menos de 2.5 s).`, `su sitio tarda ${seconds(speedMs)} s en cargar en celular`);
    }

    // Aunque el contenido principal aparezca pronto, una carga completa muy larga también es un problema.
    const fullLoad = d.load ?? 0;
    if (fullLoad > 8000 && !issues.some((i) => i.code === "slow")) {
      add("slow", "medium", "Tarda en terminar de cargar", `La página tarda ${seconds(fullLoad)} s en cargar por completo.`, `su sitio tarda ${seconds(fullLoad)} s en terminar de cargar en celular`);
    }

    const mb = v.bytes / 1_000_000;
    if (mb > 6) add("heavy", "high", "Sitio muy pesado", `La página descarga ${mb.toFixed(1)} MB.`, `su sitio pesa ${mb.toFixed(1)} MB y gasta muchos datos al abrirlo`);
    else if (mb > 3) add("heavy", "medium", "Sitio pesado", `La página descarga ${mb.toFixed(1)} MB.`, `su sitio pesa ${mb.toFixed(1)} MB y tarda en abrir con datos móviles`);

    if (https && v.mixed > 0) {
      add("mixed_content", "medium", "Contenido inseguro mezclado", `${v.mixed} recursos se cargan por HTTP dentro de una página HTTPS.`, "su sitio mezcla contenido inseguro y puede mostrar avisos");
    }
    if (!d.title || d.title.length < 10) {
      add("no_title", "medium", "Título de página pobre", d.title ? `El título «${d.title}» es muy corto.` : "La página no tiene título.", "su sitio casi no tiene información para aparecer bien en Google");
    }
    if (!d.description) add("no_description", "low", "Sin descripción para Google", "Falta la meta descripción que Google muestra en los resultados.", "su sitio no tiene descripción para los resultados de Google");
    if (d.h1 === 0) add("no_h1", "low", "Sin encabezado principal", "No hay un título principal (H1) que explique de qué trata la página.", "su sitio no tiene un título principal claro");
    if (d.imgCount >= 4 && d.imgNoAlt / d.imgCount > 0.5) {
      add("images_no_alt", "low", "Imágenes sin texto alternativo", `${d.imgNoAlt} de ${d.imgCount} imágenes no tienen descripción (afecta accesibilidad y SEO).`, "sus imágenes no tienen descripción y eso resta visibilidad en Google");
    }
    if (!d.hasTel && !d.hasWhatsapp && !d.hasMail && !d.hasForm) {
      add("no_contact", "medium", "Sin forma clara de contacto", "No se encontró botón de llamada, WhatsApp, correo ni formulario.", "su sitio no tiene un botón claro de WhatsApp o llamada para que los clientes lo contacten");
    }
    const year = new Date().getFullYear();
    if (d.copyrightYear && d.copyrightYear <= year - 3) {
      add("outdated", d.copyrightYear <= year - 6 ? "medium" : "low", "Parece desactualizado", `El pie de página dice © ${d.copyrightYear}.`, `su sitio parece desactualizado (el pie de página dice © ${d.copyrightYear})`);
    }
    if (d.cls > 0.25) add("layout_shift", "low", "La página se mueve al cargar", `Cambio de diseño acumulado: ${d.cls}.`, "su sitio se mueve mientras carga y eso incomoda a los visitantes");
    if (d.bodyFontPx < 13) add("small_text", "low", "Texto muy pequeño", `El texto base mide ${d.bodyFontPx}px.`, "el texto de su sitio es muy pequeño para leerse en celular");
  }

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const score = notLoading ? 0 : Math.max(0, 100 - issues.reduce((sum, i) => sum + SEVERITY_PENALTY[i.severity], 0));

  const top = issues.filter((i) => i.severity !== "low").slice(0, 2);
  // "su sitio X y su sitio Y" -> "su sitio X y Y"
  const joined = (list: Issue[]) => list.map((i, idx) => (idx ? i.pitch.replace(/^su sitio (?!web)/, "") : i.pitch)).join(" y ");
  const headline = top.length
    ? joined(top)
    : issues.length
      ? issues[0].pitch
      : "su sitio funciona bien, pero se puede mejorar para atraer más clientes";

  return {
    finalUrl,
    score,
    headline,
    issues,
    screenshot: v.screenshot,
    metrics: {
      finalUrl,
      status: v.status,
      https,
      ttfbMs: d?.ttfb ?? null,
      domContentLoadedMs: d?.dcl ?? null,
      loadMs: d?.load ?? null,
      lcpMs: d?.lcp || null,
      cls: d?.cls ?? null,
      requests: v.requests,
      bytes: v.bytes,
      mixedContent: v.mixed,
      blockedRequests: v.blocked,
      viewport: d?.viewport ?? null,
      overflowPx: d ? Math.max(0, d.scrollWidth - d.innerWidth) : null,
      title: d?.title ?? null,
      hasDescription: d ? !!d.description : null,
      h1: d?.h1 ?? null,
      images: d?.imgCount ?? null,
      imagesWithoutAlt: d?.imgNoAlt ?? null,
      contact: d ? { tel: d.hasTel, whatsapp: d.hasWhatsapp, mail: d.hasMail, form: d.hasForm } : null,
      copyrightYear: d?.copyrightYear ?? null,
      generator: d?.generator ?? null,
      bodyFontPx: d?.bodyFontPx ?? null,
      loadError: v.loadError,
    },
  };
}
