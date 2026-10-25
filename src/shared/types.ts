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

/** Umiejętność postaci z cechami wykrytymi z jej opisu. */
export interface AbilityInfo {
  slot: "P" | "Q" | "W" | "E" | "R";
  name: string; // w języku UI
  cc: boolean; // twarde CC: ogłuszenie, podrzucenie, unieruchomienie...
  heal: boolean; // leczenie / kradzież życia
  dash: boolean; // doskok, skok, teleport
}

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
  /** Pasywka i Q/W/E/R – do konkretnych opisów ("ma doskok: E – Bezwzględny Pościg"). */
  abilities: AbilityInfo[];
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
  /** Strona mapy drużyny gracza (z klienta): niebieska (lewy dół) albo czerwona (prawy góra). */
  mySide: "blue" | "red" | null;
}

export interface ScoreBreakdown {
  meta: number; // -1..1
  counter: number; // -1..1
  synergy: number; // -1..1
  composition: number; // -1..1
  total: number; // 0..100
  confidence: number; // 0..1 – ile danych stoi za oceną
  /** Ile meczów tej postaci na tej pozycji jest w statystykach (0 = brak danych). */
  games: number;
  /** Winrate na tej pozycji (0..1), gdy są statystyki. */
  winrate: number | null;
  /** Jak często postać jest wybierana na tę pozycję (0..1). */
  pickRate: number | null;
}

/** Powód oceny z "tonem": zaleta, wada albo informacja (UI koloruje je różnie). */
export interface Reason {
  text: string;
  tone: "plus" | "minus" | "info";
}

export interface PickRecommendation {
  championId: number;
  name: string;
  image: string;
  score: ScoreBreakdown;
  reasons: Reason[];
  /** Porównanie z pozostałymi propozycjami: dlaczego ta postać jest wyżej/niżej i w czym się wyróżnia. */
  comparison: string[];
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

export interface RuneRef {
  id: number;
  name: string;
  image: string;
}

export interface RuneRecommendation {
  primaryTree: RuneRef;
  secondaryTree: RuneRef;
  /** Kamień węgielny + 3 runy z drzewa głównego. */
  primary: RuneRef[];
  /** 2 runy z drzewa pomocniczego. */
  secondary: RuneRef[];
  /** 3 odłamki statystyk (atak / elastyczne / obrona). */
  shards: RuneRef[];
  /** Pełna strona run (9 ID) w kolejności oczekiwanej przez klienta – pozwala ją zaimportować. */
  perkIds: number[];
  primaryStyleId: number;
  subStyleId: number;
  source: "stats" | "heuristic";
}

export type Skill = "Q" | "W" | "E" | "R";

export interface BuildRecommendation {
  championId: number;
  championName: string;
  position: Position;
  /** Przedmioty startowe (ze statystyk, gdy crawler zbierał osie czasu meczów). */
  starters: ItemRef[];
  core: ItemRef[];
  boots: ItemRef | null;
  /** Kolejne przedmioty po core – razem z core i butami dają pełny build na 6 slotów. */
  late: ItemRef[];
  situational: SituationalItem[];
  summonerSpells: SpellRef[];
  summonerReason: string;
  runes: RuneRecommendation | null;
  skillOrder: {
    /** Kolejność maksowania, np. ["Q", "W", "E"]. */
    max: Skill[];
    /** Umiejętność do rozwinięcia na każdym poziomie 1–18. */
    levels: Skill[];
    source: "stats" | "heuristic";
  };
  source: "stats" | "heuristic";
  /** Wyniki wybranego wariantu w statystykach (null = dobrany heurystycznie, bez danych). */
  mainStats: { core: WinStat | null; runes: WinStat | null; summoners: WinStat | null };
  /** Inne warianty grane przez graczy – żeby nie ograniczać się do jednego buildu. */
  alternatives: BuildAlternatives;
  notes: string[];
}

/** Liczba gier i winrate wariantu w statystykach. */
export interface WinStat {
  games: number;
  winrate: number;
}

export interface BuildAlternatives {
  /** Inne ścieżki 3 pierwszych przedmiotów (kolejność zakupu). */
  cores: (WinStat & { items: ItemRef[] })[];
  /** Inne strony run. */
  runes: (WinStat & { page: RuneRecommendation })[];
  /** Inne pary czarów przywoływacza. */
  summoners: (WinStat & { spells: SpellRef[] })[];
}

/** Linia, którą jungler może gankować. */
export type GankLane = "TOP" | "MIDDLE" | "BOTTOM";

export interface GankTarget {
  lane: GankLane;
  score: number; // im wyżej, tym lepszy cel
  verdict: "best" | "good" | "weak";
  allies: string[];
  enemies: string[];
  reasons: Reason[];
}

export interface JunglePlan {
  champion: string;
  style: "gank" | "farm";
  styleReason: string;
  side: "blue" | "red" | null;
  /** Obozy w kolejności (np. ["Red buff", "Blue buff", "Gromp"]). */
  path: string[];
  /** Po której stronie mapy kończy się clear i kiedy jungler jest gotowy do akcji. */
  endsNear: GankLane;
  readyAt: string;
  targets: GankTarget[];
  notes: string[];
}

/** Trzy scenariusze wyboru: postać pasująca idealnie, neutralnie i koszmarnie do tego draftu. */
export interface PickScenario {
  kind: "ideal" | "neutral" | "nightmare";
  pick: PickRecommendation;
  summary: string[];
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
  /** KTO odpowiada za daną cechę – do konkretnych opisów (np. leczący z nazwami umiejętności). */
  who: {
    physical: string[];
    magic: string[];
    healers: string[];
    cc: string[];
    tanks: string[];
    assassins: string[];
    divers: string[];
    melee: string[];
    squishy: string[];
  };
  notes: string[];
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "mock";

export interface AppState {
  connection: ConnectionStatus;
  gameflowPhase: string;
  patch: string; // wersja Data Dragon, np. 16.21.1
  statsPatch: string | null; // patch, z którego pochodzą statystyki
  statsMatches: number;
  /** Rangi graczy, z których meczów pochodzą statystyki, np. ["MASTER", "GRANDMASTER"]. */
  statsTiers: string[] | null;
  /** Serwer, z którego pochodzą statystyki, np. "eun1". */
  statsPlatform: string | null;
  draft: DraftState | null;
  picks: PickRecommendation[];
  build: BuildRecommendation | null;
  /** Idealny / neutralny / koszmarny wybór (pusta lista, gdy za mało kandydatów). */
  scenarios: PickScenario[];
  /** Plan dla gracza na jungli: pierwszy clear i linie do ganku (null, gdy gracz nie gra w dżungli). */
  jungle: JunglePlan | null;
  allyAnalysis: TeamAnalysis | null;
  enemyAnalysis: TeamAnalysis | null;
  champions: Record<number, { name: string; image: string }>;
  updatedAt: string;
}
