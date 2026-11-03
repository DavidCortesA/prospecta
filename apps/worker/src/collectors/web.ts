import { chromium } from "playwright";
import type { CollectResult, Source } from "../db.js";
import { config } from "../config.js";
import { isAllowedByRobots } from "./robots.js";

/**
 * Colector web con Playwright. Solo se ejecuta si la fuente está marcada como
 * `scraping_allowed` (términos del sitio revisados) y robots.txt lo permite.
 * Extrae datos de contacto públicos de la página (mailto:/tel:) como un prospecto.
 */
export async function collectWeb(source: Source): Promise<CollectResult> {
  if (!source.url) throw new Error("La fuente web no tiene URL");
  if (!source.scraping_allowed) {
    throw new Error("Scraping no autorizado para esta fuente (scraping_allowed = false)");
  }
  if (!(await isAllowedByRobots(source.url))) {
    throw new Error("robots.txt no permite acceder a esta URL");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ userAgent: config.userAgent });
    await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const data = await page.evaluate(() => {
      const attr = (prefix: string) =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>(`a[href^="${prefix}"]`)).map(
          (a) => a.getAttribute("href")!.slice(prefix.length).split("?")[0].trim()
        );
      return {
        title: document.title,
        emails: attr("mailto:"),
        phones: attr("tel:"),
      };
    });

    if (!data.emails.length && !data.phones.length) return { leads: [] };

    return {
      leads: [
        {
          name: data.title || source.name,
          company: data.title || null,
          email: data.emails[0] ?? null,
          phone: data.phones[0] ?? null,
          website: source.url,
          raw: { emails: data.emails, phones: data.phones },
        },
      ],
    };
  } finally {
    await browser.close();
  }
}
