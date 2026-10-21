import type { PickRecommendation, ScoreBreakdown } from "../../shared/types";

const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")}%`;
/** Polska odmiana: 1 mecz, 2–4 mecze, 5+ meczów (ale 12–14 meczów). */
const matches = (n: number) =>
  `${n} ${n === 1 ? "mecz" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "mecze" : "meczów"}`;

/** Słowna ocena zamiast samej liczby. */
function verdict(total: number): { label: string; cls: string } {
  if (total >= 62) return { label: "Świetny wybór", cls: "great" };
  if (total >= 56) return { label: "Dobry wybór", cls: "good" };
  if (total >= 48) return { label: "Przyzwoity wybór", cls: "ok" };
  return { label: "Raczej odradzany", cls: "bad" };
}

function confidenceLabel(c: number): string {
  if (c >= 0.6) return "dużo danych";
  if (c >= 0.3) return "średnio danych";
  return "mało danych";
}

/** Pasek od -1 do 1 (środek = neutralnie). */
function Bar({ label, hint, value }: { label: string; hint: string; value: number }) {
  const width = Math.abs(value) * 50;
  return (
    <div className="bar" title={`${label}: ${hint}`}>
      <span>{label}</span>
      <div className="track">
        <div className={`fill ${value >= 0 ? "pos" : "neg"}`} style={value >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} />
      </div>
    </div>
  );
}

function Breakdown({ s }: { s: ScoreBreakdown }) {
  return (
    <div className="breakdown">
      <Bar label="Siła na patchu" hint="winrate i popularność postaci na tej pozycji" value={s.meta} />
      <Bar label="Przeciw wrogom" hint="jak radzi sobie przeciw wybranym przeciwnikom" value={s.counter} />
      <Bar label="Z sojusznikami" hint="jak wygrywa razem z Twoją drużyną" value={s.synergy} />
      <Bar label="Pasuje do składu" hint="czy uzupełnia braki drużyny (obrażenia AD/AP, tank, CC)" value={s.composition} />
    </div>
  );
}

function Stats({ s }: { s: ScoreBreakdown }) {
  if (s.winrate === null) return <div className="pick-stats muted">Brak meczów w statystykach – ocena na podstawie klasy postaci i składu</div>;
  return (
    <div className="pick-stats">
      Winrate <b>{pct(s.winrate)}</b> · grana w <b>{pct(s.pickRate ?? 0)}</b> gier na tej pozycji · {matches(s.games)} w danych
    </div>
  );
}

export function PickSuggestions({ picks }: { picks: PickRecommendation[] }) {
  return (
    <div className="card">
      <h3>Rekomendowane picki</h3>
      <details className="howto">
        <summary>Jak czytać ocenę?</summary>
        <ul>
          <li>
            <b>Ocena 0–100</b> łączy cztery rzeczy. 50 to przeciętny wybór, powyżej 60 – bardzo dobry.
          </li>
          <li>
            <b>Siła na patchu</b> – jak często postać wygrywa i jak często jest wybierana na tej pozycji.
          </li>
          <li>
            <b>Przeciw wrogom / Z sojusznikami</b> – czy w meczach z tymi postaciami wygrywa częściej niż zwykle.
          </li>
          <li>
            <b>Pasuje do składu</b> – czy uzupełnia braki drużyny, np. dodaje obrażenia magiczne albo tanka.
          </li>
          <li>
            Zielony pasek w prawo = plus, czerwony w lewo = minus. <b>„Mało danych”</b> oznacza, że ocena opiera się na niewielu meczach
            – traktuj ją ostrożnie.
          </li>
        </ul>
      </details>
      <ol className="picks">
        {picks.map((p) => {
          const v = verdict(p.score.total);
          return (
            <li key={p.championId}>
              <img src={p.image} alt="" />
              <div className="pick-body">
                <div className="pick-title">
                  <b>{p.name}</b>
                  <span className={`score ${v.cls}`}>{p.score.total}/100</span>
                  <span className={`verdict ${v.cls}`}>{v.label}</span>
                  <small className="muted" title="Ile meczów stoi za tą oceną">
                    · {confidenceLabel(p.score.confidence)}
                  </small>
                </div>
                <Stats s={p.score} />
                {p.comparison.length > 0 && (
                  <div className="comparison">
                    <span>Na tle pozostałych propozycji:</span>
                    <ul>
                      {p.comparison.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Breakdown s={p.score} />
                {p.reasons.length > 0 && (
                  <ul className="reasons">
                    {p.reasons.slice(0, 4).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
