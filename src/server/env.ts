import path from "node:path";

/**
 * Wczytuje zmienne z pliku `.env` w folderze projektu (np. RIOT_API_KEY=...).
 * Plik jest w .gitignore – klucz nie trafi do repozytorium ani do kodu.
 * Zmienne ustawione ręcznie w terminalu mają pierwszeństwo.
 */
export function loadEnvFile(file = path.resolve(".env")): void {
  try {
    process.loadEnvFile(file);
  } catch {
    /* brak pliku .env – to normalne */
  }
}
