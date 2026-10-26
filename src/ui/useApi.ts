import { useEffect, useState } from "react";

/**
 * Pobiera dane z lokalnego API (tier lista, postacie…). `version` zmienia się przy nowym patchu
 * albo nowych statystykach – wtedy dane pobierają się ponownie.
 */
export function useApi<T>(url: string, version = ""): { data: T | null; error: string | null } {
  const [result, setResult] = useState<{ url: string; data: T | null; error: string | null }>({ url: "", data: null, error: null });
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error((body as { message?: string }).message ?? `Błąd ${res.status}`);
        return body as T;
      })
      .then((data) => !cancelled && setResult({ url, data, error: null }))
      .catch((err: Error) => !cancelled && setResult({ url, data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [url, version]);
  // Dane z poprzedniego adresu nie są pokazywane przy nowym (np. po przejściu do innej postaci).
  return result.url === url ? result : { data: null, error: null };
}
