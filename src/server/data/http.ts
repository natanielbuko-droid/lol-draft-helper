import fs from "node:fs/promises";
import path from "node:path";

/** Pobiera JSON z ponowieniami (sieć potrafi zawieść – aplikacja nie powinna się wtedy wywracać). */
export async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

/**
 * Pobiera JSON, ale najpierw zagląda do pamięci podręcznej na dysku.
 * Plik w cache jest przypisany do konkretnej wersji gry, więc po nowym patchu
 * automatycznie pobierze się świeża wersja.
 */
export async function cachedJson<T>(cacheFile: string, url: string): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(cacheFile, "utf8")) as T;
  } catch {
    const data = await fetchJson<T>(url);
    await fs.mkdir(path.dirname(cacheFile), { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(data));
    return data;
  }
}

/** Wykonuje zadania równolegle, ale nie więcej niż `limit` naraz (żeby nie zalać serwera). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
