import { useState } from "react";
import type { AppState } from "../../shared/types";

/**
 * Import buildu do klienta LoL: runy, czary przywoływacza i zestaw przedmiotów w sklepie.
 * Przełącznik "automatycznie" importuje wszystko samo, gdy gracz zablokuje postać.
 */
export function ImportBar({ state }: { state: AppState }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { auto, status } = state.clientImport;
  const current = status && state.build && status.championId === state.build.championId ? status : null;

  const importNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/import", { method: "POST" });
      if (!res.ok) setError(((await res.json()) as { message: string }).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleAuto = async () => {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoImport: !auto }) });
  };

  return (
    <section className="card import-bar">
      <div className="import-row">
        <div>
          <div className="import-title">Import do klienta LoL</div>
          <div className="muted small">runy · czary przywoływacza · zestaw przedmiotów w sklepie</div>
        </div>
        <label className="switch" title="Po zablokowaniu postaci aplikacja sama ustawi runy, czary i przedmioty">
          <input type="checkbox" checked={auto} onChange={toggleAuto} />
          <span className="slider" />
          <span className="switch-label">Automatycznie po zablokowaniu</span>
        </label>
        <button onClick={importNow} disabled={busy || !state.build}>
          {busy ? "Importuję…" : "Importuj teraz"}
        </button>
      </div>
      {error && <p className="import-error">{error}</p>}
      {current && (
        <ul className="import-status">
          {current.parts.map((p) => (
            <li key={p.part} className={p.ok ? "ok" : "fail"} title={p.message}>
              <span className="tone">{p.ok ? "✓" : "✕"}</span>
              <b>{p.part}</b> <span className="muted">{p.message}</span>
            </li>
          ))}
          <li className="import-when muted small">
            {current.auto ? "zaimportowano automatycznie po zablokowaniu" : "zaimportowano ręcznie"} ·{" "}
            {new Date(current.at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
          </li>
        </ul>
      )}
    </section>
  );
}
