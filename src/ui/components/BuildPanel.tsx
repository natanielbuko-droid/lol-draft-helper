import { Fragment, useState, type ReactNode } from "react";
import { POSITION_LABEL, type BuildRecommendation, type ItemRef, type RuneRecommendation, type RuneRef, type WinStat } from "../../shared/types";
import { CardHead, pct, plural } from "./ui";

/** "54,2% · 37 gier" – wyniki wariantu w statystykach. */
function Stat({ s }: { s: WinStat | null }) {
  if (!s) return null;
  return (
    <span className="winstat" title="Winrate i liczba gier tego wariantu w statystykach">
      <b>{pct(s.winrate)}</b> · {plural(s.games, "gra", "gry", "gier")}
    </span>
  );
}

function Item({ item, step, small = false }: { item: ItemRef; step?: number; small?: boolean }) {
  return (
    <figure className={`item ${small ? "small" : ""}`} title={`${item.name} (${item.gold} złota)`}>
      {step !== undefined && <span className="step">{step}</span>}
      <img src={item.image} alt="" />
      {!small && <figcaption>{item.name}</figcaption>}
    </figure>
  );
}

/** Przedmioty w kolejności zakupu, ze strzałkami między nimi. */
function ItemPath({ items, small = false }: { items: ItemRef[]; small?: boolean }) {
  return (
    <div className="item-path">
      {items.map((i, n) => (
        <Fragment key={`${i.id}-${n}`}>
          {n > 0 && <span className="arrow">›</span>}
          <Item item={i} step={n + 1} small={small} />
        </Fragment>
      ))}
    </div>
  );
}

function Rune({ rune, keystone = false }: { rune: RuneRef; keystone?: boolean }) {
  return (
    <div className={`rune ${keystone ? "keystone" : ""}`} title={rune.name}>
      <img src={rune.image} alt="" />
      <span>{rune.name}</span>
    </div>
  );
}

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div className="build-section">
      <div className="section-title">
        <h3>{title}</h3>
        {extra}
      </div>
      {children}
    </div>
  );
}

const SKILL_HINT = "Na każdym poziomie postaci rozwijasz jedną umiejętność. R (ult) – na poziomach 6, 11 i 16.";

/** `readOnly` – build oglądany poza champ selectem (strona postaci): bez zapisywania run w kliencie. */
export function BuildPanel({ build, champion, readOnly = false }: { build: BuildRecommendation; champion?: { name: string; image: string }; readOnly?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const { runes, skillOrder, alternatives: alt, mainStats } = build;

  /** Zapisuje w kliencie główną stronę run albo wybraną alternatywną. */
  const applyRunes = async (page?: RuneRecommendation) => {
    const res = await fetch("/api/runes/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(page ? { primaryStyleId: page.primaryStyleId, subStyleId: page.subStyleId, perkIds: page.perkIds } : {}),
    });
    setMsg(((await res.json()) as { message: string }).message);
  };

  // Pełny build w kolejności zakupu: core (3) -> buty -> kolejne przedmioty.
  const fullBuild = [...build.core, ...(build.boots ? [build.boots] : []), ...build.late];

  return (
    <section className="card build">
      <CardHead
        title={
          <span className="build-title">
            {champion && (
              <span className="portrait gold">
                <img src={champion.image} alt="" />
              </span>
            )}
            Build: {build.championName}
          </span>
        }
        sub={`${POSITION_LABEL[build.position]} · ${build.source === "stats" ? "na podstawie meczów graczy" : "dobrany automatycznie – mało danych"}`}
      />

      <Section title="Przedmioty" extra={<Stat s={mainStats.core} />}>
        {build.starters.length > 0 && (
          <div className="starters">
            <span className="label">Na start</span>
            <div className="item-path">
              {build.starters.map((i, n) => (
                <Item key={`${i.id}-${n}`} item={i} small />
              ))}
            </div>
          </div>
        )}
        <ItemPath items={fullBuild} />
        {alt.cores.length > 0 && (
          <details className="alts">
            <summary>Inne buildy grane przez graczy ({alt.cores.length})</summary>
            <ul>
              {alt.cores.map((c) => (
                <li key={c.items.map((i) => i.id).join(">")}>
                  <ItemPath items={c.items} small />
                  <Stat s={c} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Sytuacyjne – zamień, gdy pasuje do wroga">
        {build.situational.length === 0 ? (
          <p className="muted">
            {readOnly
              ? "W champ selekcie aplikacja dobierze tu przedmioty pod skład wroga (anty-heal, pancerz, odporność na magię…)."
              : "Brak szczególnych zagrożeń – trzymaj się powyższego buildu."}
          </p>
        ) : (
          <ul className="situational">
            {build.situational.map((i) => (
              <li key={i.id}>
                <Item item={i} small />
                <div>
                  <b>{i.name}</b>
                  <p>{i.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {runes && (
        <Section
          title="Runy"
          extra={
            <>
              <span className="muted small">{runes.source === "stats" ? "najczęściej wygrywająca strona" : "dobrane automatycznie"}</span>
              <Stat s={mainStats.runes} />
            </>
          }
        >
          <div className="rune-page">
            <div className="rune-tree">
              <div className="tree-name">
                <img src={runes.primaryTree.image} alt="" /> {runes.primaryTree.name}
              </div>
              {runes.primary.map((r, n) => (
                <Rune key={r.id} rune={r} keystone={n === 0} />
              ))}
            </div>
            <div className="rune-tree">
              <div className="tree-name">
                <img src={runes.secondaryTree.image} alt="" /> {runes.secondaryTree.name}
              </div>
              {runes.secondary.map((r) => (
                <Rune key={r.id} rune={r} />
              ))}
              <div className="tree-name shards-title">Odłamki</div>
              <div className="shards">
                {runes.shards.map((r, n) => (
                  <img key={`${r.id}-${n}`} src={r.image} alt="" title={r.name} />
                ))}
              </div>
            </div>
          </div>
          {!readOnly && (
            <div className="actions">
              <button onClick={() => applyRunes()}>Zapisz runy w kliencie LoL</button>
              {msg && <span className="muted small">{msg}</span>}
            </div>
          )}
          {alt.runes.length > 0 && (
            <details className="alts">
              <summary>Inne strony run ({alt.runes.length})</summary>
              <ul>
                {alt.runes.map((r) => (
                  <li key={r.page.perkIds.join(",")}>
                    <div className="alt-runes">
                      <img className="alt-keystone" src={r.page.primary[0].image} alt="" title={r.page.primary[0].name} />
                      <div>
                        <b>{r.page.primary[0].name}</b>
                        <div className="muted small">
                          {r.page.primaryTree.name} + {r.page.secondaryTree.name}
                        </div>
                      </div>
                      <div className="alt-rune-icons">
                        {[...r.page.primary.slice(1), ...r.page.secondary].map((x) => (
                          <img key={x.id} src={x.image} alt="" title={x.name} />
                        ))}
                      </div>
                    </div>
                    <Stat s={r} />
                    {!readOnly && (
                      <button className="secondary small" onClick={() => applyRunes(r.page)}>
                        Zapisz
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>
      )}

      <div className="build-row">
        <Section title="Czary" extra={<Stat s={mainStats.summoners} />}>
          <div className="spells">
            {build.summonerSpells.map((s) => (
              <figure className="item" key={s.id} title={s.name}>
                <img src={s.image} alt="" />
                <figcaption>{s.name}</figcaption>
              </figure>
            ))}
          </div>
          <p className="muted small">{build.summonerReason}</p>
          {alt.summoners.length > 0 && (
            <details className="alts">
              <summary>Inne pary czarów ({alt.summoners.length})</summary>
              <ul>
                {alt.summoners.map((a) => (
                  <li key={a.spells.map((x) => x.id).join("+")}>
                    <span className="alt-spells">
                      {a.spells.map((x) => (
                        <img key={x.id} src={x.image} alt="" title={x.name} />
                      ))}
                      {a.spells.map((x) => x.name).join(" + ")}
                    </span>
                    <Stat s={a} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>

        <Section
          title="Umiejętności"
          extra={<span className="muted small">{skillOrder.source === "stats" ? "ze statystyk" : "ogólna reguła"}</span>}
        >
          <div className="max-order" title={SKILL_HINT}>
            Maksuj:
            {skillOrder.max.map((s, n) => (
              <Fragment key={s}>
                {n > 0 && <span className="arrow">›</span>}
                <span className={`key ${s}`}>{s}</span>
              </Fragment>
            ))}
          </div>
          <div className="skills" title={SKILL_HINT}>
            {(["Q", "W", "E", "R"] as const).map((s) => (
              <div key={s} className="skill-row">
                <span className={`key ${s}`}>{s}</span>
                {skillOrder.levels.map((lvl, n) => (
                  <span key={n} className={lvl === s ? `on ${s}` : ""}>
                    {lvl === s ? n + 1 : ""}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Section>
      </div>

      {build.notes.length > 0 && (
        <details className="notes-box">
          <summary>Uwagi do buildu ({build.notes.length})</summary>
          <ul className="notes">
            {build.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
