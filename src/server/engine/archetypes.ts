/**
 * Archetypy składów – klasyczne plany gry drużyny w LoL. Opisy i listy postaci są stałe (zmieniają się rzadko),
 * a statystyki przykładowych postaci (pozycja, winrate) aplikacja dolicza na bieżąco z meczów.
 * Postacie podane kluczem Data Dragon; klucz, którego nie ma w bieżącym patchu, jest po prostu pomijany.
 */
export interface ArchetypeDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  winCondition: string;
  strengths: string[];
  weaknesses: string[];
  strongAgainst: string[];
  weakAgainst: string[];
  champions: string[];
}

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: "engage",
    name: "Wejście (engage)",
    tagline: "Jedno dobre rozpoczęcie walki wygrywa grę.",
    description:
      "Tanki i postacie z obszarowym CC, które same rozpoczynają walkę 5 na 5 i łapią kilku wrogów naraz – reszta drużyny dobija unieruchomionych.",
    winCondition: "Wymuszaj walki drużynowe przy smokach i Baronie, najlepiej gdy wrogowie stoją blisko siebie w wąskim przejściu.",
    strengths: ["Narzuca walkę wtedy, kiedy drużyna chce", "Obszarowe CC unieruchamia kilku wrogów naraz", "Bardzo mocne w środku gry"],
    weaknesses: ["Gdy wejście się nie uda, drużyna zostaje bez najważniejszych umiejętności", "Męczy się z postaciami, które odrzucają i uciekają"],
    strongAgainst: ["poke"],
    weakAgainst: ["protect"],
    champions: [
      "Malphite", "Ornn", "Sion", "Maokai", "Kennen", "Gragas",
      "Amumu", "Sejuani", "Zac", "JarvanIV", "MonkeyKing",
      "Orianna", "Galio",
      "MissFortune", "Seraphine",
      "Leona", "Nautilus", "Rell", "Rakan", "Alistar",
    ],
  },
  {
    id: "poke",
    name: "Poke i oblężenie",
    tagline: "Osłabić wroga, zanim walka w ogóle się zacznie.",
    description:
      "Postacie z dużym zasięgiem, które z bezpiecznej odległości zabierają wrogom zdrowie, a potem biorą wieże, bo wróg nie jest w stanie ich bronić.",
    winCondition: "Ostrzeliwuj wroga przed celem (smok, wieża) i atakuj dopiero, gdy ma mało zdrowia. Unikaj walk w krzakach i ciasnej dżungli.",
    strengths: ["Wygrywa walki, zanim się zaczną", "Łatwo bierze wieże i oblega bazę", "Mało ryzyka – walczy z daleka"],
    weaknesses: ["Słabe, gdy wróg szybko doskoczy (engage, dive)", "Mało obrażeń w długiej walce wręcz"],
    strongAgainst: ["protect"],
    weakAgainst: ["engage", "dive"],
    champions: [
      "Jayce", "Kennen",
      "Nidalee",
      "Xerath", "Ziggs", "Zoe", "Velkoz", "Hwei", "Corki", "Mel", "Lux",
      "Varus", "Ezreal", "Caitlyn", "Jhin", "Smolder",
      "Karma",
    ],
  },
  {
    id: "protect",
    name: "Ochrona carry",
    tagline: "Cała drużyna pracuje na jednego strzelca.",
    description:
      "Strzelec, który w późnej grze zadaje ogromne obrażenia, i postacie, które go pilnują: osłony, leczenie, odrzuty i przyspieszenia.",
    winCondition: "Przetrwaj wczesną grę, daj carry spokojnie farmić, a w walkach trzymaj się przy nim – niech wrogowie sami wejdą pod jego obrażenia.",
    strengths: ["Najmocniejszy skład w późnej grze", "Świetnie broni się przed wejściem i nurkowaniem (dive)"],
    weaknesses: ["Słaby na początku gry", "Mało sposobów na wymuszenie walki – poke i split push potrafią go wymęczyć"],
    strongAgainst: ["engage", "dive"],
    weakAgainst: ["poke", "split"],
    champions: [
      "TahmKench",
      "Ivern",
      "Galio",
      "Jinx", "KogMaw", "Aphelios", "Vayne", "Twitch", "Kaisa", "Zeri",
      "Lulu", "Janna", "Milio", "Yuumi", "Soraka", "Braum", "Taric", "Renata", "Nami",
    ],
  },
  {
    id: "dive",
    name: "Dive i łapanie (pick)",
    tagline: "Złap jednego wroga i wygraj walkę 5 na 4.",
    description:
      "Zabójcy i wojownicy z doskokami oraz postacie z hakami i ogłuszeniami. Wskakują na najważniejszego wroga (zwykle strzelca) albo łapią kogoś samotnego na mapie.",
    winCondition: "Kontroluj wizję, czekaj w krzakach i atakuj, gdy wróg idzie samotnie albo jego carry stoi za daleko od drużyny.",
    strengths: ["Szybko eliminuje kruche postacie", "Mocny w środku gry i w walce o wizję"],
    weaknesses: ["Słabnie, gdy wrogowie trzymają się razem i chronią carry", "Wymaga dobrej wizji i wyczucia czasu"],
    strongAgainst: ["poke", "split"],
    weakAgainst: ["protect"],
    champions: [
      "Camille", "Irelia",
      "Rengar", "Khazix", "Evelynn", "Vi", "XinZhao", "Nocturne", "Elise", "Kayn", "LeeSin", "Naafiri",
      "Zed", "Talon", "Akali", "Qiyana", "Diana", "Ahri", "Fizz", "Leblanc",
      "Pyke", "Blitzcrank", "Thresh",
    ],
  },
  {
    id: "split",
    name: "Split push",
    tagline: "Jedna osoba ciągnie boczną linię, reszta trzyma środek mapy.",
    description:
      "Silny pojedynkowicz spycha boczną linię i zmusza wroga do wysłania kogoś do obrony. Pozostali w tym czasie biorą smoki, Barona albo wieże po drugiej stronie mapy.",
    winCondition: "Spychaj boczną linię, gdy reszta drużyny może bezpiecznie czekać przy celu. Gdy wróg wyśle do Ciebie dwie osoby – drużyna atakuje 4 na 3.",
    strengths: ["Wygrywa pojedynki 1 na 1", "Rozciąga wroga po całej mapie"],
    weaknesses: ["Drużyna walczy w osłabieniu 4 na 5", "Bez wizji łatwo dać się złapać na bocznej linii"],
    strongAgainst: ["protect", "engage"],
    weakAgainst: ["dive"],
    champions: [
      "Fiora", "Jax", "Tryndamere", "Camille", "Yorick", "Shen", "Nasus", "Gwen", "Trundle", "Quinn", "Kayle", "Ambessa",
      "TwistedFate",
    ],
  },
];
