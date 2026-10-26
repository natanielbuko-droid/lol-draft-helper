import { startServer } from "./app";

/** Uruchomienie z terminala (npm start / start.bat). Aplikacja desktopowa woła startServer() sama – patrz src/desktop/main.ts. */
startServer()
  .then((server) => {
    if (server.external) return; // działa już inna kopia – została otwarta w przeglądarce
    const shutdown = () => {
      server.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((err) => {
    console.error("Błąd krytyczny:", err);
    process.exit(1);
  });
