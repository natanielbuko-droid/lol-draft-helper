# LoL Draft Helper

Samowystarczalny asystent do League of Legends (w stylu Blitz / Mobalytics / Porofessor):

- **Draft Helper** – ranking picków w champ selekcie na żywo (meta + kontry + synergia + analiza składu),
- **Dynamiczne buildy** – core + przedmioty sytuacyjne dopasowane do wrogiego składu, runy, czary, kolejność umiejętności,
- **Autonomia** – dane o grze pobierane automatycznie przy każdym nowym patchu; statystyki zbierane własnym crawlerem.

> 🧪 **Wersja testowa.** Aplikacja jest we wczesnej fazie – chętnie przyjmę uwagi i zgłoszenia błędów w zakładce
> [Issues](../../issues).

---

## 1. Jak przetestować (Windows)

1. Zainstaluj **[Node.js](https://nodejs.org) w wersji LTS** (20.12 lub nowszej) – zwykły instalator, wszystko „Dalej”.
2. Pobierz aplikację: zielony przycisk **Code → Download ZIP** na tej stronie, a potem **rozpakuj archiwum**
   (prawy przycisk na pliku ZIP → „Wyodrębnij wszystkie…”). Uruchamianie plików bezpośrednio z ZIP-a nie zadziała.
3. Kliknij dwukrotnie:
   - **`demo.bat`** – tryb demo z symulowanym champ selectem. Nie potrzebujesz włączonej gry. Zacznij od tego.
   - **`start.bat`** – wersja dla prawdziwej gry. Włącz klienta League of Legends i wejdź do wyboru postaci;
     rekomendacje pojawią się same.

Za pierwszym razem instalacja zależności trwa około minuty. Potem przeglądarka sama otworzy **http://localhost:4777**.
Aplikację zamykasz, zamykając czarne okno konsoli.

**Co jest w środku:** dane gry (postacie, przedmioty, runy) pobierają się automatycznie z bieżącego patcha.
Statystyki (winrate, kontry, buildy) są dołączone w `seed/stats.json.gz` i pochodzą wyłącznie z meczów rankingowych
graczy z rang **Master i Grandmaster** – liczba meczów jest widoczna w nagłówku aplikacji. Traktuj je jako wskazówkę,
a nie wyrocznię (aplikacja pokazuje przy każdej ocenie, ile danych za nią stoi).

**Zgłaszając błąd**, opisz co robiłeś i wklej ostatnie linie z okna konsoli.

### Częste problemy

| Problem | Rozwiązanie |
|---|---|
| `start.bat` „nie chce się włączyć”, okno mignie i znika albo pisze „Brakuje plików aplikacji” | plik został uruchomiony prosto z ZIP-a. Kliknij prawym na pobrany ZIP → **Wyodrębnij wszystkie…**, otwórz rozpakowany folder `lol-draft-helper-main` i uruchom `start.bat` stamtąd |
| Niebieskie okno „System Windows ochronił ten komputer” | to standardowe ostrzeżenie dla plików z internetu: kliknij **Więcej informacji → Uruchom mimo to** |
| „Nie znaleziono Node.js” | zainstaluj Node.js LTS i uruchom plik ponownie |
| „LoL Draft Helper już działa w innym oknie” | aplikacja jest już uruchomiona – otworzy się w przeglądarce, a nowe okno możesz zamknąć |
| „Port 4777 jest zajęty przez inny program – używam portu 4778” | wszystko w porządku – aplikacja sama wybrała wolny port |
| `npm : File ... npm.ps1 cannot be loaded` w PowerShellu | używaj plików `.bat` albo wpisuj `npm.cmd` zamiast `npm` |
| „Czekam na klienta League of Legends” | włącz klienta gry; jeśli gra jest w nietypowym folderze, ustaw zmienną `LOL_PATH` |

---

## 2. Dla programistów

Wymagania: [Node.js](https://nodejs.org) 20.12 lub nowszy. Na Windowsie w PowerShellu używaj `npm.cmd`, jeśli `npm`
jest blokowany przez zasady wykonywania skryptów.

```bash
npm install
```

```bash
npm run dev:mock
```

Otwórz http://localhost:5173 – symulowany champ select z automatycznym przeładowaniem kodu.
Z prawdziwą grą: `npm run dev`.

| Polecenie | Co robi |
|---|---|
| `npm run dev` / `npm run dev:mock` | tryb deweloperski (UI na :5173, API na :4777) |
| `npm start` / `npm run demo` | buduje UI i uruchamia jedną aplikację na http://localhost:4777 (dodaj `-- --open`, by otworzyć przeglądarkę) |
| `npm test` | testy silnika (bez internetu) |
| `npm run typecheck` | sprawdzenie typów TypeScript |
| `npm run crawl` | zbiera statystyki z Riot API (patrz rozdział 6) |

---

## 3. Architektura

### Stos technologiczny

| Warstwa | Technologia | Dlaczego |
|---|---|---|
| Backend / silnik | **Node.js + TypeScript** | ten sam język co UI, wspólne typy (`src/shared/types.ts`), świetne wsparcie WebSocket |
| UI | **React + Vite** | szybki rozwój, komponenty |
| Komunikacja UI ↔ backend | **WebSocket** (push) + REST | stan draftu zmienia się co sekundę – serwer sam wypycha zmiany |
| Komunikacja z grą | **LCU API** (REST + WebSocket/WAMP) | oficjalnie tolerowane lokalne API klienta |
| Dane o grze | **Data Dragon** + **CommunityDragon** | publiczne, aktualizowane z każdym patchem, bez klucza |
| Statystyki | **Riot API (match-v5)** → własny crawler | winrate, matchupy, synergie, buildy z bieżącego patcha |
| Okno desktopowe (opcjonalnie) | Electron lub Tauri | patrz „Dalszy rozwój” |

### Przepływ danych

```
 ┌───────────────────────┐   co 30 min: czy jest nowy patch?
 │ Data Dragon / CDragon │──────────────┐
 └───────────────────────┘              ▼
 ┌───────────────────────┐      ┌──────────────┐      ┌─────────────────────┐      ┌──────────┐
 │ Statystyki (crawler / │─────▶│   GameData   │─────▶│ Silnik rekomendacji │─────▶│ API + WS │──▶ UI (React)
 │ zdalny serwer STATS)  │      │ + StatsStore │      │ pickEngine          │      │  :4777   │
 └───────────────────────┘      └──────────────┘      │ buildEngine + rules │      └──────────┘
 ┌───────────────────────┐   zdarzenia champ select   └─────────────────────┘
 │ Klient LoL (LCU API)  │──────────────────────────────────────▲
 └───────────────────────┘
```

### Struktura plików

```
src/
├─ shared/types.ts            Typy wspólne dla serwera i UI
├─ server/
│  ├─ index.ts                Start aplikacji – łączy wszystkie moduły
│  ├─ config.ts               Konfiguracja (zmienne środowiskowe)
│  ├─ data/
│  │  ├─ ddragon.ts           Pobieranie Data Dragon (wersje, postacie, przedmioty, runy, czary)
│  │  ├─ cdragon.ts           CommunityDragon (typ obrażeń, oceny 1–3, opisy umiejętności)
│  │  ├─ championProfile.ts   Automatyczny profil postaci (leczenie, twarde CC, carry…)
│  │  ├─ itemCatalog.ts       Automatyczna klasyfikacja przedmiotów (anti-heal, pen, QSS…)
│  │  ├─ gameData.ts          Dane bieżącego patcha + watcher nowych patchy
│  │  └─ statsStore.ts        Statystyki + wygładzony winrate
│  ├─ lcu/
│  │  ├─ credentials.ts       Odczyt portu/hasła klienta (lockfile lub argumenty procesu)
│  │  ├─ lcuClient.ts         Połączenie REST + WebSocket z klientem, auto-reconnect
│  │  ├─ champSelect.ts       Sesja champ selectu → prosty DraftState
│  │  └─ mockLcu.ts           Symulator champ selectu (tryb demo)
│  ├─ engine/
│  │  ├─ teamAnalysis.ts      Analiza składu, zgadywanie pozycji wrogów
│  │  ├─ pickEngine.ts        Ocena picków
│  │  ├─ archetype.ts         Typ postaci → wartość statystyk na przedmiotach
│  │  ├─ rules.ts             Reguły przedmiotów sytuacyjnych (tabela progów)
│  │  ├─ buildEngine.ts       Core, buty, sytuacyjne, czary, runy, umiejętności
│  │  └─ index.ts             Jeden punkt wejścia: DraftState → rekomendacje
│  └─ api/server.ts           Express (REST) + WebSocket dla UI
├─ crawler/
│  ├─ riotApi.ts              Klient Riot API z limiterem zapytań
│  ├─ aggregate.ts            Zliczanie statystyk z meczów
│  └─ crawl.ts                Crawler (CLI i funkcja)
└─ ui/                        React: App + components/ (Header, DraftBoard, PickSuggestions, BuildPanel, TeamPanel)
```

### Jak aplikacja „rozmawia” z klientem LoL (LCU API)

1. **Znalezienie klienta.** Klient przy każdym starcie losuje port i hasło i zapisuje je w pliku
   `C:\Riot Games\League of Legends\lockfile` w formacie `LeagueClient:PID:PORT:HASŁO:https`.
   Jeśli gra jest gdzie indziej, czytamy argumenty procesu `LeagueClientUx.exe` (`--app-port`, `--remoting-auth-token`)
   albo ustawiasz `LOL_PATH`.
2. **Połączenie.** `wss://127.0.0.1:PORT` z nagłówkiem `Authorization: Basic base64("riot:HASŁO")`.
   Certyfikat klienta jest podpisany przez Riot, więc weryfikację wyłączamy *tylko* dla 127.0.0.1.
3. **Subskrypcja zdarzeń** (protokół WAMP – wiadomość typu `5`):
   - `OnJsonApiEvent_lol-gameflow_v1_gameflow-phase` – faza gry (`Lobby`, `ChampSelect`, `InProgress`…),
   - `OnJsonApiEvent_lol-champ-select_v1_session` – każda zmiana w champ selekcie.
4. **Zdarzenia** przychodzą jako `[8, nazwa, { uri, eventType, data }]`. `data` dla sesji zawiera m.in.
   `myTeam`, `theirTeam`, `actions` (bany/picki, `completed`, `isInProgress`), `bans`, `localPlayerCellId`, `timer.phase`.
5. **Przydatne REST:** `GET /lol-champ-select/v1/pickable-champion-ids` (postacie, które masz),
   `POST /lol-perks/v1/pages` (zapis strony run – aplikacja nadpisuje wyłącznie własną stronę „DraftHelper: …”).

---

## 4. Algorytm rekomendacji picków

Każda postać dostaje cztery składowe w skali **-1…+1**, a wynik końcowy **0…100**:

```
SCORE = 50 + 50 × (0.35·META + 0.25·COUNTER + 0.15·SYNERGY + 0.25·COMPOSITION)
```

Bez statystyk (np. przed pierwszym crawlem) wagi zmieniają się na `META 0.3 (dopasowanie klasy do roli) + COMPOSITION 0.7`.

### Pseudokod

```
funkcja RECOMMEND_PICKS(draft):
    pozycja    ← draft.myPosition  albo  pierwsza niezajęta przez sojuszników
    sojusznicy ← postacie wybrane/hoverowane przez sojuszników
    wrogowie   ← postacie zablokowane przez wrogów
    pozycje_wrogów ← INFER_POSITIONS(wrogowie)        # 120 permutacji, wybór najbardziej prawdopodobnej
    pula ← postacie grane na tej pozycji (≥0.8% gier) − bany − już wybrane   # odcina picki spoza mety

    dla każdej postaci C w puli:
        base_wr ← WYGŁADZONY_WR(C, pozycja)            # (wygrane + 150·0.5) / (gry + 150)
        popularność ← log2(udział_gier_C / średni_udział) / 2

        META    ← 0.6 · (base_wr − 50%) / 4pp  +  0.4 · popularność
                  # sam winrate z małej próbki to głównie szczęście – popularność mówi,
                  # czy postać naprawdę jest grana na tej pozycji

        COUNTER ← średnia ważona po wrogach E:
                    waga = 2 jeśli E jest na tej samej linii, inaczej 1
                    delta = WYGŁADZONY_WR(C vs E) − base_wr
                  / 4pp

        SYNERGY ← średnia po sojusznikach A: WYGŁADZONY_WR(C z A) − base_wr, / 4pp

        COMPOSITION ← suma reguł składu (każda ±0.1…0.5):
            + balans obrażeń: (50% − udział typu obrażeń C w drużynie) × 1.2
            + brak frontline'u i C jest wytrzymały           → +0.4
            + mało twardego CC i C ma dużo CC                → +0.25
            + sojusznik to hyper-carry i C to support z peelem → +0.25
            + wróg ma ≥2 diverów: C mobilny → +0.15, C miękki i statyczny → −0.15
            + wróg ma ≥2 carry i C ma twarde CC               → +0.15
            …

        WYNIK ← 50 + 50 × suma_ważona
        PEWNOŚĆ ← ile gier stoi za oceną (base + matchupy)

    ranking ← 8 najlepszych, każda z listą powodów („Dobra przeciw Darius – wygrywa o 2,3% częściej niż zwykle”)

    dla każdej propozycji P z rankingu:             # porównanie NA TLE pozostałych
        #1: dlaczego jest wyżej niż #2 (składowe z największą przewagą)
        pozostałe: w czym są lepsze od #1
        winrate P vs średnia pozostałych, w czym P jest najlepsza z listy, czy jest najpopularniejsza
```

**Dlaczego „wygładzony winrate”?** Postać z 3 wygranymi na 3 gry nie ma 100% winrate – po prostu brakuje danych.
Średnia bayesowska dodaje „wirtualne” gry po 50%, więc małe próbki są ostrożnie przyciągane do średniej.

---

## 5. Dobór przedmiotów sytuacyjnych

### Skąd aplikacja wie, który przedmiot ma Grievous Wounds?

**Z opisu przedmiotu w bieżącym patchu**, a nie z listy wpisanej w kod. `itemCatalog.ts` czyta `item.json` z Data Dragon:

- statystyki z bloku `<stats>` (np. `35 Attack Damage`, `30% Armor Penetration`),
- flagi z tekstu: `Wounds` → anti-heal, `Remove all crowd control` → QSS, `Stasis` → Zhonya, tagi `Tenacity`…

Jeśli Riot doda nowy przedmiot z Grievous Wounds – zostanie wykryty sam.

### Profil wroga

`teamAnalysis.ts` sumuje profile postaci (z CommunityDragon + analizy opisów umiejętności):
udział AD/AP (ważony obrażeniami postaci), suma twardego CC, suma leczenia, liczba tanków, zabójców, diverów.

### Reguły (`src/server/engine/rules.ts`)

```
if enemy.healing        ≥ 4            → anti-heal (Grievous Wounds); przy ≥ 7 także tani komponent na wczesny zakup
if enemy.physicalShare  ≥ 60%          → przedmioty z pancerzem (Armor)
if enemy.magicShare     ≥ 60%          → przedmioty z odpornością na magię (MR)
if enemy.frontline ≥ 2 lub avgDurability ≥ 2.2 → % penetracji pancerza/magii (anti-tank)
if enemy.hardCC         ≥ 6            → Tenacity (Mercury's), dla carry także QSS / oczyszczenie
if enemy.assassins      ≥ 2            → Stasis / Spell Shield / Lifeline
```

Każda reguła daje **siłę 0…1**; kandydaci są filtrowani tak, by **pasowali do postaci** (strzelec nie dostanie anti-heala z AP):
`dopasowanie = średnia wartości statystyk przedmiotu dla archetypu` (tabela `STAT_WEIGHTS` w `archetype.ts`).
Priorytet = `siła reguły × (0.7 + 0.3 × dopasowanie)`. Przedmiot spełniający kilka reguł dostaje wyższy priorytet.

Podobnie działa wybór **butów** (Mercury's przy dużym CC/AP, Plated Steelcaps przy dużym AD dla walczących wręcz)
i **czarów** (Cleanse zamiast Heal dla ADC przy bardzo dużym CC, Exhaust dla supportu przy zabójcach, …).

**Core build, runy, czary i kolejność umiejętności** pochodzą ze statystyk, jeśli są dostępne
(najczęstszy wariant z najwyższym wygładzonym winrate). Bez statystyk – z heurystyki opartej na archetypie,
zawsze sprawdzonej z danymi bieżącego patcha (np. jeśli keystone usunięto, wybierany jest dostępny).

---

## 6. Autonomia: aktualne patche i statystyki

| Co | Jak się aktualizuje |
|---|---|
| Postacie, przedmioty, runy, czary | `GameData` co 30 min sprawdza `versions.json`; nowy patch → pobranie i przeliczenie wszystkiego. Pliki są cache'owane w `data/cache/<wersja>/` |
| Profile postaci (typ obrażeń, CC, leczenie) | budowane od zera z CommunityDragon dla każdej wersji – nowa postać działa od razu |
| Statystyki | crawler sam wykrywa nowy patch w meczach i zaczyna liczyć od zera |
| Źródło statystyk w aplikacji | kolejno: `STATS_URL` → `data/stats/latest.json` (Twój crawler) → `seed/stats.json.gz` (dołączony do repozytorium) |

### Zbieranie statystyk (crawler)

1. Załóż konto na https://developer.riotgames.com i skopiuj **Development API Key** (ważny 24 h).
2. Skopiuj `.env.example` jako `.env` i wpisz klucz w `RIOT_API_KEY=` (plik `.env` nie trafia do gita).
3. Uruchom:

```bash
npm run crawl -- --matches 2000 --timelines
```

- domyślnie mecze pochodzą od graczy z rang **Master i Grandmaster**; `--tiers MASTER,GRANDMASTER,CHALLENGER`
  zmienia rangi (crawler nie miesza rang – inny zestaw zaczyna statystyki od zera),
- `--timelines` dodatkowo pobiera oś czasu meczu → przedmioty startowe, kolejność przedmiotów i umiejętności
  (2× więcej zapytań),
- `--platform na1` – serwer (domyślnie z `RIOT_PLATFORM` w `.env`),
- `--patch 16.20` – zbieraj wskazany patch zamiast bieżącego. Przydaje się w pierwszych dniach po premierze
  patcha, gdy mało kto zdążył na nim zagrać. Crawler sam zapamiętuje, kiedy zaczął się nowszy patch, i pyta Riot
  tylko o wcześniejsze mecze,
- kolejne uruchomienia **dopisują** mecze (pamiętane w `data/stats/<patch>.seen.json`); co 25 meczów jest zapis,
  więc przerwanie crawla nie gubi danych,
- uruchamiaj **jeden crawler naraz** – kilka procesów dzieli ten sam limit zapytań klucza.

**Błąd „Unknown apikey” (401)?** Klucz wygasł albo nie działa na danym serwerze. Sprawdź inny (`--platform na1`)
lub wygeneruj nowy klucz w Developer Portal.

Klucz deweloperski ma limit ok. 100 zapytań / 2 min → około 1500 meczów na godzinę (bez osi czasu).
Do sensownych matchupów potrzeba kilkudziesięciu tysięcy meczów – do tego służy klucz produkcyjny
i osobny serwer (patrz niżej).

Automatyczne odświeżanie w tle: ustaw `RIOT_API_KEY` i `AUTO_CRAWL_HOURS=6` przed `npm run dev`.

Żeby testerzy dostali nowe statystyki, po crawlu uruchom `npm run export-seed` – zapisze je skompresowane
w `seed/stats.json.gz` (do wysłania na GitHuba).

### Wersja „produkcyjna”

**Nigdy nie umieszczaj klucza Riot API w aplikacji dla innych osób.** Docelowo crawler działa na serwerze
(cron co kilka godzin), publikuje `latest.json` np. na CDN, a aplikacje użytkowników ustawiają tylko `STATS_URL`.

### Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---|---|---|
| `API_PORT` | 4777 | port lokalnego serwera |
| `LOCALE` | `pl_PL` | język nazw postaci/przedmiotów |
| `PATCH_CHECK_MINUTES` | 30 | jak często sprawdzać nowy patch |
| `STATS_URL` | – | zdalny plik statystyk (format `StatsFile` z `statsStore.ts`) |
| `RIOT_API_KEY`, `RIOT_PLATFORM` | –, `euw1` | crawler |
| `AUTO_CRAWL_HOURS` | 0 | automatyczny crawl w tle |
| `LOL_PATH` | – | folder gry, jeśli nie jest w `C:\Riot Games\League of Legends` |
| `MOCK_LCU=1` | – | to samo co `--mock` |

---

## 7. Zasady Riot (ważne)

- LCU API jest nieoficjalne, ale Riot toleruje narzędzia takie jak to (Blitz, Porofessor, Mobalytics działają podobnie).
  Aplikacja **tylko czyta** champ select i opcjonalnie zapisuje stronę run na Twoje kliknięcie – nie automatyzuje gry.
- Aplikacja **nie** ujawnia nicków graczy w champ selekcie (Riot zabrania deanonimizacji w rankedach) i nie pokazuje
  informacji niedostępnych w grze.
- Publiczna dystrybucja wymaga rejestracji produktu w Riot Developer Portal i zgodności z
  [polityką dla twórców](https://developer.riotgames.com/policies/general).

---

## 8. Dalszy rozwój

- **Okno desktopowe:** Electron lub Tauri ładujące `http://localhost:4777` (po `npm start`), z ikoną w trayu
  i nakładką „zawsze na wierzchu”.
- **Build w trakcie gry:** Live Client Data API (`https://127.0.0.1:2999/liveclientdata/allgamedata`)
  podaje przedmioty wrogów w czasie rzeczywistym – wystarczy podać je do `analyzeTeam`/reguł.
- **Synergie i kontry na poziomie archetypów** (np. „enchanter + hyper-carry”), gdy brak danych dla konkretnej pary.
- **Tier lista** i preferowana pula postaci gracza (`/lol-champions/v1/inventories/.../champions-minimal`, maestria).
- **Import zestawu przedmiotów** do sklepu w grze (`PUT /lol-item-sets/v1/item-sets/{summonerId}/sets`).

---

## Informacja prawna

LoL Draft Helper isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone
officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are
trademarks or registered trademarks of Riot Games, Inc.

Aplikacja nie jest powiązana z Riot Games ani przez nią wspierana. Nie zawiera klucza Riot API – statystyki
w `seed/stats.json.gz` to zagregowane, anonimowe dane meczów.
