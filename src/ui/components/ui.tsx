import type { ReactNode } from "react";

/** Słowna ocena i kolor dla wyniku 0–100 (wspólne dla listy picków i scenariuszy). */
export function verdict(total: number): { label: string; cls: "great" | "good" | "ok" | "bad" } {
  if (total >= 62) return { label: "Świetny wybór", cls: "great" };
  if (total >= 56) return { label: "Dobry wybór", cls: "good" };
  if (total >= 48) return { label: "Przyzwoity wybór", cls: "ok" };
  return { label: "Raczej odradzany", cls: "bad" };
}

/** Okrągły wskaźnik wyniku 0–100. */
export function ScoreRing({ value, size = 52 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`ring ${verdict(value).cls}`} style={{ width: size, height: size }} title={`Ocena ${value}/100`}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="ring-value"
          strokeDasharray={`${(v / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{value}</span>
    </div>
  );
}

/** Nagłówek karty: tytuł, podtytuł i opcjonalne elementy po prawej. */
export function CardHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-head">
      <div>
        <h2>{title}</h2>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {right && <div className="card-head-right">{right}</div>}
    </div>
  );
}

/** Polska odmiana liczebników: 1 mecz, 2–4 mecze, 5+ meczów (ale 12–14 meczów). */
export function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;
}

/** 0.563 -> "56,3%" */
export const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
