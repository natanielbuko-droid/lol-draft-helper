// Typy współdzielone przez serwer (Node) i interfejs (React).
// Dzięki temu UI i backend "mówią tym samym językiem".

export type Position = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY";
export const POSITIONS: Position[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

export const POSITION_LABEL: Record<Position, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  UTILITY: "Support",
};

/** Profil postaci zbudowany automatycznie z Data Dragon + CommunityDragon (nic nie jest wpisane ręcznie). */
export interface ChampionProfile {
  id: number;
  key: string; // np. "Jinx" – identyfikator z Data Dragon
  name: string; // nazwa wyświetlana (w wybranym języku)
  image: string; // URL ikony
  roles: string[]; // klasy z klienta: marksman, mage, tank, fighter, assassin, support
  damageType: "physical" | "magic" | "mixed";
  attackType: "melee" | "ranged";
  // Oceny 1–3 z klienta LoL (playstyleInfo)
  damage: number;
  durability: number;
  crowdControl: number;
  mobility: number;
  utility: number;
  /** 0–3: heurystyka z opisów umiejętności (leczenie, kradzież życia, omnivamp). */
  healing: number;
  /** Liczba umiejętności z twardym CC (stun, knock-up, supresja, root...). */
  hardCC: number;
  /** "Carry" = duże obrażenia i mała wytrzymałość – postać, którą drużyna musi chronić. */
  isCarry: boolean;
}

export interface DraftSlot {
  cellId: number;
  championId: number | null; // zablokowany lub hoverowany champion
  locked: boolean;
  position: Position | null;
  isLocalPlayer: boolean;
}

export type DraftPhase = "NONE" | "PLANNING" | "BAN_PICK" | "FINALIZATION";

export interface DraftState {
  phase: DraftPhase;
  myTeam: DraftSlot[];
  enemyTeam: DraftSlot[];
  bans: number[];
  localCellId: number;
  myPosition: Position | null;
  myChampionId: number | null;
  /** Postacie, które gracz może wybrać (z klienta). Puste = brak informacji, zakładamy wszystkie. */
  pickableChampionIds: number[];
}

export interface ScoreBreakdown {
  meta: number; // -1..1
  counter: number; // -1..1
  synergy: number; // -1..1
  composition: number; // -1..1
  total: number; // 0..100
  confidence: number; // 0..1 – ile danych stoi za oceną
}

export interface PickRecommendation {
  championId: number;
  name: string;
  image: string;
  score: ScoreBreakdown;
  reasons: string[];
}

export interface ItemRef {
  id: string;
  name: string;
  image: string;
  gold: number;
}

export interface SituationalItem extends ItemRef {
  rule: string; // id reguły, np. "anti-heal"
  reason: string; // wyjaśnienie dla gracza
  priority: number; // 0..1
}

export interface SpellRef {
  id: string;
  name: string;
  image: string;
}

export interface RuneRecommendation {
  primaryTree: string;
  keystone: string;
  keystoneImage: string;
  secondaryTree: string;
  /** Pełna strona run (9 ID) – tylko gdy pochodzi ze statystyk; wtedy można ją zaimportować do klienta. */
  perkIds: number[];
  primaryStyleId: number;
  subStyleId: number;
  source: "stats" | "heuristic";
}

export interface BuildRecommendation {
  championId: number;
  championName: string;
  position: Position;
  core: ItemRef[];
  boots: ItemRef | null;
  situational: SituationalItem[];
  summonerSpells: SpellRef[];
  summonerReason: string;
  runes: RuneRecommendation | null;
  skillOrder: { order: string; source: "stats" | "heuristic" };
  source: "stats" | "heuristic";
  notes: string[];
}

export interface TeamAnalysis {
  champions: string[];
  physicalShare: number; // 0..1 udział obrażeń fizycznych
  magicShare: number;
  totalCC: number;
  hardCC: number;
  healing: number;
  frontline: number; // ilu "tanków"/wytrzymałych
  avgDurability: number;
  assassins: number;
  /** Wojownicy/zabójcy walczący wręcz, którzy "wchodzą" w tylną linię. */
  divers: number;
  melee: number;
  carries: string[];
  notes: string[];
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "mock";

export interface AppState {
  connection: ConnectionStatus;
  gameflowPhase: string;
  patch: string; // wersja Data Dragon, np. 16.21.1
  statsPatch: string | null; // patch, z którego pochodzą statystyki
  statsMatches: number;
  draft: DraftState | null;
  picks: PickRecommendation[];
  build: BuildRecommendation | null;
  allyAnalysis: TeamAnalysis | null;
  enemyAnalysis: TeamAnalysis | null;
  champions: Record<number, { name: string; image: string }>;
  updatedAt: string;
}
