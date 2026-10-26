import { useEffect, useState } from "react";
import { POSITIONS, type Position } from "../shared/types";

/**
 * Prosty router na adresie po "#" (działa tak samo w przeglądarce i w oknie aplikacji desktopowej):
 *   #/                     – champ select na żywo albo ekran startowy
 *   #/tier/BOTTOM          – tier lista pozycji
 *   #/champions            – wszystkie postacie
 *   #/champion/222/BOTTOM  – strona postaci (pozycja opcjonalna)
 *   #/comps                – archetypy składów
 */
export type Route =
  | { page: "live" }
  | { page: "tier"; position: Position }
  | { page: "champions" }
  | { page: "champion"; id: number; position: Position | null }
  | { page: "comps" };

const asPosition = (p: string | undefined): Position | null => (POSITIONS.includes(p as Position) ? (p as Position) : null);

export function parseRoute(hash: string): Route {
  // "#/comps#engage" – druga kotwica wskazuje sekcję na stronie, nie jest częścią trasy.
  const [page, a, b] = hash.replace(/^#\/?/, "").split("#")[0].split("/");
  if (page === "tier") return { page: "tier", position: asPosition(a) ?? "TOP" };
  if (page === "champions") return { page: "champions" };
  if (page === "champion" && Number(a) > 0) return { page: "champion", id: Number(a), position: asPosition(b) };
  if (page === "comps") return { page: "comps" };
  return { page: "live" };
}

export const href = {
  live: () => "#/",
  tier: (p: Position = "TOP") => `#/tier/${p}`,
  champions: () => "#/champions",
  champion: (id: number, p?: Position | null) => `#/champion/${id}${p ? `/${p}` : ""}`,
  comps: () => "#/comps",
};

export function navigate(to: string) {
  if (location.hash !== to) location.hash = to;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
