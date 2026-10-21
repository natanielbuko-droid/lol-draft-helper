import { useEffect, useState } from "react";
import type { AppState } from "../shared/types";

/**
 * Hook React: utrzymuje połączenie WebSocket z lokalnym serwerem
 * i zwraca zawsze najnowszy stan aplikacji. Po zerwaniu łączy się ponownie.
 */
export function useAppState(): { state: AppState | null; online: boolean } {
  const [state, setState] = useState<AppState | null>(null);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout>;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setOnline(true);
      ws.onmessage = (e) => setState(JSON.parse(e.data) as AppState);
      ws.onclose = () => {
        setOnline(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return { state, online };
}
