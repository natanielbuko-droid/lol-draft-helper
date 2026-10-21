import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * Dane logowania do lokalnego API klienta LoL (LCU).
 * Klient przy każdym uruchomieniu losuje nowy port i hasło – musimy je odczytać.
 */
export interface LcuCredentials {
  port: number;
  password: string;
  protocol: string;
}

const DEFAULT_PATHS = [
  "C:/Riot Games/League of Legends",
  "D:/Riot Games/League of Legends",
  "/Applications/League of Legends.app/Contents/LoL",
];

/**
 * Sposób 1: plik `lockfile` w folderze gry. Format: `LeagueClient:PID:PORT:HASŁO:https`.
 * Istnieje tylko wtedy, gdy klient jest uruchomiony.
 */
async function fromLockfile(installPath: string | null): Promise<LcuCredentials | null> {
  const dirs = installPath ? [installPath, ...DEFAULT_PATHS] : DEFAULT_PATHS;
  for (const dir of dirs) {
    try {
      const raw = await fs.readFile(path.join(dir, "lockfile"), "utf8");
      const [, , port, password, protocol] = raw.trim().split(":");
      return { port: Number(port), password, protocol };
    } catch {
      /* próbujemy kolejnej ścieżki */
    }
  }
  return null;
}

/**
 * Sposób 2 (gdy gra jest zainstalowana w nietypowym miejscu): odczyt argumentów procesu
 * LeagueClientUx, który dostaje port i token w linii poleceń.
 */
async function fromProcess(): Promise<LcuCredentials | null> {
  try {
    const cmd =
      process.platform === "win32"
        ? await run("powershell.exe", [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine",
          ])
        : await run("sh", ["-c", "ps -A -o args | grep LeagueClientUx"]);
    const out = cmd.stdout;
    const port = out.match(/--app-port=(\d+)/)?.[1];
    const password = out.match(/--remoting-auth-token=([\w-]+)/)?.[1];
    return port && password ? { port: Number(port), password, protocol: "https" } : null;
  } catch {
    return null;
  }
}

export async function findLcuCredentials(installPath: string | null): Promise<LcuCredentials | null> {
  return (await fromLockfile(installPath)) ?? (await fromProcess());
}
