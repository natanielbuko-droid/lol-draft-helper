# Przekaźnik Riot API (wyszukiwarka graczy)

Mały serwer na Cloudflare Workers, który dokłada klucz Riot API do zapytań wyszukiwarki graczy.
Dzięki niemu aplikacja u testerów nie potrzebuje własnego klucza, a klucz nie trafia do instalatora.

- przepuszcza **tylko** 6 rodzajów zapytań potrzebnych do profilu gracza (biała lista w `src/index.ts`),
- trzyma odpowiedzi w pamięci podręcznej Cloudflare (mecze tydzień, profil kilka minut) – mniej zapytań do Riot,
- darmowy plan Cloudflare: 100 tys. zapytań dziennie.

## Wdrożenie (jednorazowo)

Wymaga darmowego konta Cloudflare (https://dash.cloudflare.com/sign-up).

```bash
cd relay
npx wrangler login
npx wrangler secret put RIOT_API_KEY
npx wrangler deploy
```

`wrangler login` otwiera przeglądarkę – zaloguj się i zatwierdź dostęp. `secret put` pyta o klucz (wklej go tam,
nie do czatu ani do plików). `deploy` wypisze adres w stylu `https://lol-draft-helper-relay.<konto>.workers.dev`.

Ten adres trafia do aplikacji jako domyślny `PLAYER_API_URL` (`DEFAULT_PLAYER_API_URL` w `src/server/config.ts`).

**Wdrożony adres:** https://lol-draft-helper-relay.loldrafthelper.workers.dev (`/health` – czy działa).

## Zmiana klucza

Po zatwierdzeniu klucza produkcyjnego (albo gdy wygaśnie deweloperski): `npx wrangler secret put RIOT_API_KEY`
i wklej nowy. Aplikacji nie trzeba aktualizować.
