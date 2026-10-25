import { useState } from "react";
import type { PickRecommendation, Reason, ScoreBreakdown } from "../../shared/types";
import { CardHead, pct, plural, ScoreRing, verdict } from "./ui";

/** Ile propozycji pokazujemy od razu – resztę po kliknięciu "Pokaż wszystkie". */
const INITIAL_VISIBLE = 12;
/** Ile powodów pokazujemy przy postaci (reszta po rozwinięciu). */
const REASONS_VISIBLE = 4;

function confidenceLabel(c: number): string {
  if (c >= 0.6) return "dużo danych";
  if (c >= 0.3) return "średnio danych";
  return "mało danych";
}

/** Pasek od -1 do 1 (środek = neutralnie). */
function Meter({ label, hint, value }: { label: string; hint: string; value: number }) {
  const width = Math.abs(value) * 50;
  return (
    <div className="meter" title={`${label}: ${hint}`}>
      <span>{label}</span>
      <div className="meter-track">
        <div className={`meter-fill ${value >= 0 ? "pos" : "neg"}`} style={value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
      </div>
    </div>
  );
}

function Meters({ s }: { s: ScoreBreakdown }) {
  return (
    <div className="meters">
      <Meter label="Siła na patchu" hint="winrate i popularność postaci na tej pozycji" value={s.meta} />
      <Meter label="Przeciw wrogom" hint="jak radzi sobie przeciw wybranym przeciwnikom" value={s.counter} />
      <Meter label="Z sojusznikami" hint="jak wygrywa razem z Twoją drużyną" value={s.synergy} />
      <Meter label="Pasuje do składu" hint="czy uzupełnia braki drużyny (obrażenia AD/AP, tank, CC)" value={s.composition} />
    </div>
  );
}

function Chips({ s }: { s: ScoreBreakdown }) {
  if (s.winrate === null) return <div className="chips"><span className="chip">Brak meczów w statystykach – ocena z klasy postaci i składu</span></div>;
  return (
    <div className="chips">
      <span className="chip" title="Odsetek wygranych gier na tej pozycji">
        Winrate <b>{pct(s.winrate)}</b>
      </span>
      <span className="chip" title="Jak często postać jest wybierana na tę pozycję">
        Popularność <b>{pct(s.pickRate ?? 0)}</b>
      </span>
      <span className="chip">{plural(s.games, "mecz", "mecze", "meczów")}</span>
      <span className={`chip conf ${s.confidence >= 0.6 ? "hi" : s.confidence >= 0.3 ? "mid" : "lo"}`} title="Ile meczów stoi za tą oceną">
        {confidenceLabel(s.confidence)}
      </span>
    </div>
  );
}

const TONE_ICON: Record<Reason["tone"], string> = { plus: "✓", minus: "✕", info: "i" };

function Reasons({ reasons }: { reasons: Reason[] }) {
  const [open, setOpen] = useState(false);
  if (!reasons.length) return null;
  const shown = open ? reasons : reasons.slice(0, REASONS_VISIBLE);
  return (
    <>
      <ul className="reasons">
        {shown.map((r) => (
          <li key={r.text} className={r.tone}>
            <span className="tone">{TONE_ICON[r.tone]}</span>
            {r.text}
          </li>
        ))}
      </ul>
      {reasons.length > REASONS_VISIBLE && (
        <button className="link" onClick={() => setOpen(!open)}>
          {open ? "Mniej powodów" : `Wszystkie powody (${reasons.length})`}
        </button>
      )}
    </>
  );
}

function PickCard({ p, rank, open, onToggle }: { p: PickRecommendation; rank: number; open: boolean; onToggle: () => void }) {
  const v = verdict(p.score.total);
  const s = p.score;
  return (
    <li className={`pick ${rank <= 3 ? "top" : ""} ${open ? "open" : ""}`}>
      <button className="pick-row" onClick={onToggle} aria-expanded={open} title={open ? "Zwiń" : "Pokaż szczegóły"}>
        <span className={`rank ${rank <= 3 ? "gold" : ""}`}>#{rank}</span>
        <span className={`portrait ring-${v.cls}`}>
          <img src={p.image} alt="" />
        </span>
        <span className="pick-main">
          <span className="pick-name">{p.name}</span>
          <span className={`verdict ${v.cls}`}>{v.label}</span>
        </span>
        <span className="pick-quick">
          {s.winrate !== null ? (
            <>
              <span title="Winrate na tej pozycji">
                WR <b>{pct(s.winrate)}</b>
              </span>
              <span title="Jak często postać jest wybierana na tę pozycję">
                Pick <b>{pct(s.pickRate ?? 0)}</b>
              </span>
            </>
          ) : (
            <span className="muted">brak danych</span>
          )}
        </span>
        <ScoreRing value={s.total} size={40} />
        <span className="chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="pick-details">
          <Chips s={s} />
          {p.comparison.length > 0 && (
            <div className="comparison">
              <span>Na tle pozostałych</span>
              <ul>
                {p.comparison.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <Reasons reasons={p.reasons} />
          <Meters s={s} />
        </div>
      )}
    </li>
  );
}

export function PickSuggestions({ picks }: { picks: PickRecommendation[] }) {
  const [showAll, setShowAll] = useState(false);
  // Akordeon: rozwinięty jest jeden pick – domyślnie aktualny #1, po kliknięciu wybrany przez gracza (0 = wszystkie zwinięte).
  const [openId, setOpenId] = useState<number | null>(null);
  const isOpen = (p: PickRecommendation, rank: number) => (openId === null ? rank === 1 : openId === p.championId);
  const visible = showAll ? picks : picks.slice(0, INITIAL_VISIBLE);
  return (
    <section className="card">
      <CardHead
        title="Rekomendowane picki"
        sub={`${picks.length} postaci grywalnych na tej pozycji, od najlepszej`}
        right={
          <details className="howto">
            <summary>Jak czytać ocenę?</summary>
            <div className="howto-body">
              <p>
                <b>Ocena 0–100</b> łączy cztery rzeczy. 50 to przeciętny wybór, powyżej 60 – bardzo dobry.
              </p>
              <p>
                <b>Siła na patchu</b> – jak często postać wygrywa i jak często jest wybierana na tej pozycji.
              </p>
              <p>
                <b>Przeciw wrogom / Z sojusznikami</b> – czy w meczach z tymi postaciami wygrywa częściej niż zwykle.
              </p>
              <p>
                <b>Pasuje do składu</b> – czy uzupełnia braki drużyny, np. dodaje obrażenia magiczne albo tanka.
              </p>
              <p>
                <span className="tone-inline plus">✓</span> zaleta · <span className="tone-inline minus">✕</span> wada ·{" "}
                <span className="tone-inline info">i</span> informacja. „Mało danych” – ocena opiera się na niewielu meczach.
              </p>
            </div>
          </details>
        }
      />
      <ol className="picks">
        {visible.map((p, n) => (
          <PickCard
            key={p.championId}
            p={p}
            rank={n + 1}
            open={isOpen(p, n + 1)}
            onToggle={() => setOpenId(isOpen(p, n + 1) ? 0 : p.championId)}
          />
        ))}
      </ol>
      {picks.length > INITIAL_VISIBLE && (
        <button className="secondary wide" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Pokaż tylko najlepsze" : `Pokaż wszystkie (${picks.length})`}
        </button>
      )}
    </section>
  );
}
