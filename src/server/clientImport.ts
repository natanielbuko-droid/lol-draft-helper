import fs from "node:fs/promises";
import path from "node:path";
import type { BuildRecommendation, ImportStatus } from "../shared/types";
import type { GameData } from "./data/gameData";
import { OWN_PREFIX, type DraftSource } from "./lcu/lcuClient";

const FLASH = 4;

/** Ustawienia użytkownika zapisywane na dysku (data/settings.json). */
export interface Settings {
  autoImport: boolean;
}

export async function loadSettings(dataDir: string): Promise<Settings> {
  try {
    return { autoImport: true, ...JSON.parse(await fs.readFile(path.join(dataDir, "settings.json"), "utf8")) };
  } catch {
    return { autoImport: true };
  }
}

export async function saveSettings(dataDir: string, settings: Settings): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(path.join(dataDir, "settings.json"), JSON.stringify(settings, null, 2));
}

/**
 * Kolejność czarów: Flash zostaje na klawiszu, którego gracz używa (D albo F).
 * `current` to czary wybrane teraz w kliencie (spell1 = D, spell2 = F).
 */
export function orderSpells(recommended: number[], current: { spell1Id?: number; spell2Id?: number } | null): [number, number] {
  const [a, b] = recommended;
  if (!recommended.includes(FLASH)) return [a, b];
  const other = a === FLASH ? b : a;
  return current?.spell2Id === FLASH ? [other, FLASH] : [FLASH, other];
}

/** Bloki zestawu przedmiotów w sklepie w grze. */
export function itemSetBlocks(build: BuildRecommendation): { type: string; items: string[] }[] {
  const ids = (items: { id: string }[]) => items.map((i) => i.id);
  const unique = (list: string[]) => [...new Set(list)];
  const blocks = [
    { type: "Na start", items: ids(build.starters) },
    { type: "Build – kupuj w tej kolejności", items: ids([...build.core, ...(build.boots ? [build.boots] : []), ...build.late]) },
    { type: "Sytuacyjne (pod skład wroga)", items: ids(build.situational) },
    { type: "Inne buildy graczy", items: unique(build.alternatives.cores.flatMap((c) => ids(c.items))) },
  ];
  return blocks.filter((b) => b.items.length > 0);
}

/**
 * Importuje do klienta LoL: stronę run, czary przywoływacza i zestaw przedmiotów.
 * Każda część jest niezależna – błąd jednej nie blokuje pozostałych.
 */
export async function importBuild(
  source: DraftSource,
  build: BuildRecommendation,
  data: GameData,
  currentSpells: { spell1Id?: number; spell2Id?: number } | null,
  auto: boolean,
): Promise<ImportStatus> {
  const name = `${OWN_PREFIX}: ${build.championName}`.slice(0, 25);
  const result: ImportStatus = { championId: build.championId, champion: build.championName, auto, at: new Date().toISOString(), parts: [] };
  const run = async (part: string, fn: () => Promise<string>) => {
    try {
      result.parts.push({ part, ok: true, message: await fn() });
    } catch (err) {
      result.parts.push({ part, ok: false, message: (err as Error).message });
    }
  };

  await run("Runy", async () => {
    const page = build.runes;
    if (!page || page.perkIds.length !== 9) throw new Error("brak pełnej strony run");
    const valid = page.perkIds.every((id) => data.perks.has(id)) && [page.primaryStyleId, page.subStyleId].every((id) => data.perkStyles.some((s) => s.id === id));
    if (!valid) throw new Error("strona zawiera runy spoza bieżącego patcha");
    await source.applyRunePage({ name, primaryStyleId: page.primaryStyleId, subStyleId: page.subStyleId, selectedPerkIds: page.perkIds });
    return `${page.primary[0].name} (${page.primaryTree.name} + ${page.secondaryTree.name})`;
  });

  await run("Czary", async () => {
    if (build.summonerSpells.length !== 2) throw new Error("brak rekomendowanej pary czarów");
    const [d, f] = orderSpells(build.summonerSpells.map((s) => s.key), currentSpells);
    await source.applySummonerSpells(d, f);
    const label = (key: number) => build.summonerSpells.find((s) => s.key === key)?.name ?? key;
    return `D: ${label(d)}, F: ${label(f)}`;
  });

  await run("Przedmioty", async () => {
    const blocks = itemSetBlocks(build);
    await source.applyItemSet({ title: name, championId: build.championId, blocks });
    return `zestaw „${name}” w sklepie (${blocks.length} sekcje)`;
  });

  return result;
}
