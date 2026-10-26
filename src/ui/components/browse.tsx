import type { Position, Tier } from "../../shared/types";
import { href } from "../router";

/** Wspólne drobne elementy stron przeglądania (tier lista, postacie, składy). */

export const ROLE_NAME: Record<string, string> = {
  marksman: "Strzelec",
  mage: "Mag",
  tank: "Tank",
  fighter: "Wojownik",
  assassin: "Zabójca",
  support: "Wsparcie",
};

export const TIER_HINT: Record<Tier, string> = {
  S: "Tier S – najmocniejsze ~10% postaci na tej pozycji",
  A: "Tier A – bardzo mocna",
  B: "Tier B – solidna",
  C: "Tier C – słabsza na tym patchu",
  D: "Tier D – najsłabsze na tym patchu",
};

export function TierBadge({ tier, size = "md" }: { tier: Tier | null; size?: "sm" | "md" | "lg" }) {
  if (!tier) return null;
  return (
    <span className={`tier-badge t-${tier} ${size}`} title={TIER_HINT[tier]}>
      {tier}
    </span>
  );
}

/** Portret postaci z podpisem – link do strony postaci. */
export function ChampLink({
  id,
  name,
  image,
  position,
  sub,
}: {
  id: number;
  name: string;
  image: string;
  position?: Position | null;
  sub?: React.ReactNode;
}) {
  return (
    <a className="champ-link" href={href.champion(id, position)} title={`${name} – build, kontry i synergie`}>
      <img src={image} alt="" />
      <span>
        <b>{name}</b>
        {sub && <span className="muted small">{sub}</span>}
      </span>
    </a>
  );
}

/** Pasek winrate wokół 50% (do tabel): od 44% do 56%. */
export function WinrateBar({ value }: { value: number }) {
  const w = Math.max(0, Math.min(1, (value - 0.44) / 0.12));
  return (
    <span className="wr-bar" aria-hidden>
      <i className={value >= 0.5 ? "pos" : "neg"} style={{ width: `${Math.round(w * 100)}%` }} />
    </span>
  );
}
