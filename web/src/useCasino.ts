import { useEffect, useRef, useState } from "react";
import { toWsUrl } from "./api";
import type { BigEvent, ConnectionStatus, State } from "./types";

const PING_MS = 10_000;
const STALE_MS = 25_000;
const MAX_BACKOFF_MS = 15_000;

/** Subscribes to the public state WebSocket; auto-reconnects with backoff and pings to detect dead links. */
export function useCasino(baseUrl: string, onBig?: (e: BigEvent) => void) {
  const [state, setState] = useState<State | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const onBigRef = useRef(onBig);
  onBigRef.current = onBig;

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let attempt = 0;
    let lastActivity = Date.now();
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      setStatus(attempt === 0 ? "connecting" : "reconnecting");
      try {
        ws = new WebSocket(toWsUrl(baseUrl));
      } catch {
        retry();
        return;
      }
      const sock = ws;
      sock.onopen = () => {
        attempt = 0;
        lastActivity = Date.now();
        setStatus("connected");
        sock.send(JSON.stringify({ t: "getSnapshot" }));
        pingTimer = setInterval(() => {
          if (Date.now() - lastActivity > STALE_MS) return sock.close();
          sock.send('{"t":"ping"}');
        }, PING_MS);
      };
      sock.onmessage = (e) => {
        lastActivity = Date.now();
        try {
          const f = JSON.parse(String(e.data)) as { t: string; state?: State; event?: BigEvent };
          if (f.t === "state" && f.state) setState(f.state);
          else if (f.t === "big" && f.event) onBigRef.current?.(f.event);
        } catch {
          /* ignore malformed frame */
        }
      };
      sock.onclose = () => {
        clearInterval(pingTimer);
        if (!closed) retry();
      };
      sock.onerror = () => sock.close();
    };
    const retry = () => {
      setStatus("reconnecting");
      reconnectTimer = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++));
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      ws?.close();
    };
  }, [baseUrl]);

  return { state, status };
}
