import fs from "node:fs";
import path from "node:path";
import { format } from "node:util";
import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from "electron";
import updater from "electron-updater";

/**
 * Aplikacja desktopowa (Electron): ten sam serwer co w `npm start`, ale w oknie z ikoną w zasobniku.
 *  - zamknięcie okna chowa je do zasobnika – aplikacja dalej śledzi champ select,
 *  - w champ selekcie okno samo się pokazuje (bez kradzenia fokusu z klienta LoL),
 *  - autostart z Windows (domyślnie włączony, w tle) i automatyczne aktualizacje z GitHub Releases.
 */

const { autoUpdater } = updater;
const UPDATE_CHECK_HOURS = 4;

// Druga kopia (np. drugi klik w skrót) tylko pokazuje okno pierwszej i od razu się kończy.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();

const resourcesDir = app.isPackaged ? process.resourcesPath : app.getAppPath();
const userDir = app.getPath("userData");
const iconPath = path.join(resourcesDir, app.isPackaged ? "icon.ico" : "build-resources/icon.ico");
const logFile = path.join(userDir, "logs", "app.log");
const prefsFile = path.join(userDir, "desktop.json");
// Serwer czyta te ścieżki z konfiguracji: dane i cache w profilu użytkownika, interfejs i statystyki startowe z instalacji.
process.env.DATA_DIR ??= path.join(userDir, "data");
process.env.RESOURCES_DIR ??= resourcesDir;

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let serverUrl = "";
let trayHintShown = false;

if (primary) setupLogFile();

interface Prefs {
  /** Czy pierwsze uruchomienie już ustawiło autostart (żeby nie włączać go ponownie, gdy gracz go wyłączył). */
  autostartInitialized: boolean;
}

function readPrefs(): Prefs {
  try {
    return { autostartInitialized: false, ...JSON.parse(fs.readFileSync(prefsFile, "utf8")) };
  } catch {
    return { autostartInitialized: false };
  }
}

function writePrefs(prefs: Prefs) {
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(prefsFile, JSON.stringify(prefs, null, 2));
}

/** Kopia logów do pliku – testerzy mogą go dołączyć do zgłoszenia na GitHubie. */
function setupLogFile() {
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  // Nowy plik przy każdym starcie, poprzedni zostaje jako app.old.log.
  try {
    fs.renameSync(logFile, logFile.replace(/\.log$/, ".old.log"));
  } catch {
    /* pierwszy start */
  }
  const stream = fs.createWriteStream(logFile, { flags: "a" });
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      stream.write(`${new Date().toISOString()} [${level}] ${format(...args)}\n`);
      original(...args);
    };
  }
}

const startedHidden = process.argv.includes("--hidden");

function showWindow(focus = true) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (focus) {
    win.show();
    win.focus();
  } else if (!win.isVisible()) {
    // W champ selekcie gracz patrzy na klienta LoL – pokazujemy okno bez zabierania fokusu i mrugamy na pasku zadań.
    win.showInactive();
    win.flashFrame(true);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 760,
    minHeight: 560,
    show: false,
    backgroundColor: "#050b14",
    icon: iconPath,
    title: "LoL Draft Helper",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.removeMenu();
  void win.loadURL(serverUrl);
  win.once("ready-to-show", () => {
    if (!startedHidden) showWindow();
  });
  // Linki (np. do GitHuba) otwieramy w zwykłej przeglądarce, nie w oknie aplikacji.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.on("focus", () => win?.flashFrame(false));
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    win?.hide();
    if (!trayHintShown) {
      trayHintShown = true;
      tray?.displayBalloon({
        iconType: "info",
        title: "LoL Draft Helper działa dalej",
        content: "Aplikacja jest w zasobniku obok zegara i pokaże się sama w champ selekcie. Zakończysz ją z menu ikony.",
      });
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const autostart = app.getLoginItemSettings().openAtLogin;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Otwórz LoL Draft Helper", click: () => showWindow() },
      { label: "Otwórz w przeglądarce", click: () => void shell.openExternal(serverUrl) },
      { type: "separator" },
      {
        label: "Uruchamiaj razem z Windows",
        type: "checkbox",
        checked: autostart,
        enabled: app.isPackaged,
        click: (item) => {
          setAutostart(item.checked);
          updateTrayMenu();
        },
      },
      { label: "Sprawdź aktualizacje", enabled: app.isPackaged, click: () => void checkForUpdates(true) },
      { label: "Folder z logami (do zgłoszeń)", click: () => void shell.openPath(path.dirname(logFile)) },
      { type: "separator" },
      { label: `Wersja ${app.getVersion()}`, enabled: false },
      {
        label: "Zakończ",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function setAutostart(enabled: boolean) {
  app.setLoginItemSettings({ openAtLogin: enabled, args: ["--hidden"] });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip("LoL Draft Helper");
  tray.on("click", () => showWindow());
  updateTrayMenu();
}

// --- automatyczne aktualizacje (GitHub Releases; tylko w zainstalowanej wersji) ---
let manualCheck = false;

async function checkForUpdates(manual = false) {
  if (!app.isPackaged) return;
  manualCheck = manual;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.warn("[update] Nie udało się sprawdzić aktualizacji:", (err as Error).message);
    if (manual) void dialog.showMessageBox({ type: "warning", message: "Nie udało się sprawdzić aktualizacji.", detail: (err as Error).message });
  }
}

function setupUpdater() {
  // Błędy aktualizacji (np. brak internetu) to nie awaria aplikacji – w logu wystarczy jedna linia.
  const firstLine = (m: unknown) => console.warn("[update]", String(m).split("\n")[0]);
  autoUpdater.logger = { info: () => {}, warn: firstLine, error: firstLine, debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("update-available", (info) => console.log(`[update] Jest nowa wersja ${info.version} – pobieram w tle.`));
  autoUpdater.on("update-not-available", () => {
    if (manualCheck) void dialog.showMessageBox({ type: "info", message: `Masz najnowszą wersję (${app.getVersion()}).` });
  });
  autoUpdater.on("update-downloaded", async (info) => {
    const { response } = await dialog.showMessageBox({
      type: "info",
      buttons: ["Uruchom ponownie teraz", "Później"],
      defaultId: 0,
      cancelId: 1,
      message: `Pobrano nową wersję LoL Draft Helper (${info.version}).`,
      detail: "Zainstaluje się po ponownym uruchomieniu. Jeśli wybierzesz „Później”, zrobi się to samo przy następnym zamknięciu aplikacji.",
    });
    if (response === 0) {
      quitting = true;
      autoUpdater.quitAndInstall();
    }
  });
  void checkForUpdates();
  setInterval(() => void checkForUpdates(), UPDATE_CHECK_HOURS * 3_600_000);
}

app.on("second-instance", () => showWindow());
app.on("before-quit", () => (quitting = true));
// Okno schowane do zasobnika nie kończy aplikacji.
app.on("window-all-closed", () => {});

app.whenReady().then(async () => {
  if (!primary) return;
  console.log(`[desktop] LoL Draft Helper ${app.getVersion()} – dane: ${process.env.DATA_DIR}`);
  // Pierwsze uruchomienie zainstalowanej wersji: autostart w tle (jak Blitz / Porofessor) – można wyłączyć w menu ikony.
  const prefs = readPrefs();
  if (app.isPackaged && !prefs.autostartInitialized) {
    setAutostart(true);
    writePrefs({ ...prefs, autostartInitialized: true });
  }

  try {
    // Serwer ładujemy dopiero teraz – po ustawieniu DATA_DIR i RESOURCES_DIR.
    const { startServer } = await import("../server/app");
    const server = await startServer({
      onPhase: (phase) => {
        if (phase === "ChampSelect") showWindow(false);
      },
    });
    serverUrl = server.url;
    app.on("will-quit", () => server.stop());
  } catch (err) {
    console.error("[desktop] Serwer nie wystartował:", err);
    dialog.showErrorBox("LoL Draft Helper nie wystartował", `${(err as Error).message}\n\nLogi: ${logFile}`);
    app.exit(1);
    return;
  }

  createTray();
  createWindow();
  setupUpdater();
});
