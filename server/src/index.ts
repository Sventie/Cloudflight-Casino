/**
 * Cloudflight Casino — live state server.
 *
 * One Worker in front of one singleton Durable Object (`CasinoRoom`) that owns the whole game
 * state (players, tables, bookings). Same shape as the Club Darts relay: viewing is public over a
 * WebSocket (`GET /ws`), every write is an authenticated `POST /api/action` (HTTP Basic, only the
 * password is checked — user name is ignored). Two roles:
 *   - dealer (DEALER_PASS): seat/unseat players, book wins/losses, undo.
 *   - admin  (ADMIN_PASS):  everything a dealer can + manage players/tables/config/reset.
 *
 * Server → client frames: {"t":"state","state":State} and {"t":"big","event":BigEvent}.
 * Client → server frames: {"t":"ping"} (auto-answered with "pong" without waking the object).
 */

export interface Env {
  CASINO: DurableObjectNamespace;
  DEALER_PASS: string;
  ADMIN_PASS: string;
}

type Role = "dealer" | "admin";

interface Player {
  id: string;
  name: string;
  balance: number;
}
interface Table {
  id: string;
  name: string;
  game: string;
  seated: string[];
}
interface Tx {
  id: string;
  ts: number;
  playerId: string;
  tableId: string | null;
  /** Effective delta actually applied (after clamping at 0). */
  delta: number;
  undone: boolean;
}
interface Config {
  startBalance: number;
  bigThreshold: number;
  phase: "play" | "final";
}
interface State {
  players: Player[];
  tables: Table[];
  txs: Tx[];
  config: Config;
}
interface BigEvent {
  id: string;
  ts: number;
  kind: "win" | "loss";
  playerName: string;
  tableName: string;
  delta: number;
}

const STATE_KEY = "state";
const MAX_TXS = 300;
const MAX_NAME = 40;
const PING = '{"t":"ping"}';
const PONG = '{"t":"pong"}';

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Resolves the caller's role from HTTP Basic (password only), or null. */
function roleOf(request: Request, env: Env): Role | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return null;
  }
  const pass = decoded.slice(decoded.indexOf(":") + 1);
  if (env.ADMIN_PASS && safeEqual(pass, env.ADMIN_PASS)) return "admin";
  if (env.DEALER_PASS && safeEqual(pass, env.DEALER_PASS)) return "dealer";
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const room = env.CASINO.get(env.CASINO.idFromName("main"));

    if (url.pathname === "/ws") return room.fetch(request);

    if (url.pathname === "/api/login" && request.method === "POST") {
      const role = roleOf(request, env);
      return role ? json({ role }) : json({ error: "unauthorized" }, 401);
    }

    if (url.pathname === "/api/action" && request.method === "POST") {
      const role = roleOf(request, env);
      if (!role) return json({ error: "unauthorized" }, 401);
      const headers = new Headers(request.headers);
      headers.set("x-role", role); // set here only; never trusted from the client
      const res = await room.fetch(new Request(request.url, { method: "POST", headers, body: request.body }));
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
      return out;
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("Cloudflight Casino server OK\n", { headers: { "Content-Type": "text/plain", ...CORS } });
    }
    return json({ error: "not found" }, 404);
  },
};

function defaultState(): State {
  return {
    players: [],
    tables: [
      { id: "t1", name: "Roulette", game: "roulette", seated: [] },
      { id: "t2", name: "Blackjack", game: "blackjack", seated: [] },
      { id: "t3", name: "Poker", game: "poker", seated: [] },
    ],
    txs: [],
    config: { startBalance: 1000, bigThreshold: 300, phase: "play" },
  };
}

const uid = () => crypto.randomUUID().slice(0, 8);
const cleanName = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_NAME) : "");
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : NaN);

export class CasinoRoom {
  private state: State | null = null;

  constructor(private ctx: DurableObjectState, _env: Env) {
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  private async load(): Promise<State> {
    if (!this.state) this.state = (await this.ctx.storage.get<State>(STATE_KEY)) ?? defaultState();
    return this.state;
  }

  private async save(state: State): Promise<void> {
    this.state = state;
    await this.ctx.storage.put(STATE_KEY, state);
    this.broadcast({ t: "state", state });
  }

  private broadcast(frame: unknown): void {
    const data = JSON.stringify(frame);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        /* closing socket */
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].send(JSON.stringify({ t: "state", state: await this.load() }));
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    const role = request.headers.get("x-role") as Role | null;
    if (!role) return json({ error: "unauthorized" }, 401);
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    const state = await this.load();
    const result = this.apply(structuredClone(state), role, body);
    if ("error" in result) return json({ error: result.error }, 400);
    await this.save(result.state);
    if (result.big) this.broadcast({ t: "big", event: result.big });
    return json({ ok: true });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === "string" && message.includes("getSnapshot")) {
      ws.send(JSON.stringify({ t: "state", state: await this.load() }));
    }
  }
  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code);
    } catch {
      /* already closed */
    }
  }

  /** Pure state transition. Returns the new state (+ optional big-win/loss event) or an error. */
  private apply(s: State, role: Role, a: Record<string, unknown>): { state: State; big?: BigEvent } | { error: string } {
    const player = (id: unknown) => s.players.find((p) => p.id === id);
    const table = (id: unknown) => s.tables.find((t) => t.id === id);
    const isAdmin = role === "admin";

    switch (a.type) {
      // ---- dealer + admin ----
      case "seat": {
        const t = table(a.tableId);
        const p = player(a.playerId);
        if (!t || !p) return { error: "unknown table/player" };
        for (const other of s.tables) other.seated = other.seated.filter((id) => id !== p.id); // one table at a time
        t.seated.push(p.id);
        return { state: s };
      }
      case "unseat": {
        const t = table(a.tableId);
        if (!t) return { error: "unknown table" };
        t.seated = t.seated.filter((id) => id !== a.playerId);
        return { state: s };
      }
      case "adjust": {
        const t = table(a.tableId);
        const p = player(a.playerId);
        const delta = int(a.delta);
        if (!t || !p || !Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 1_000_000) return { error: "invalid booking" };
        const next = Math.max(0, p.balance + delta);
        const applied = next - p.balance;
        p.balance = next;
        s.txs.push({ id: uid(), ts: Date.now(), playerId: p.id, tableId: t.id, delta: applied, undone: false });
        s.txs = s.txs.slice(-MAX_TXS);
        if (Math.abs(applied) >= s.config.bigThreshold) {
          return {
            state: s,
            big: { id: uid(), ts: Date.now(), kind: applied > 0 ? "win" : "loss", playerName: p.name, tableName: t.name, delta: applied },
          };
        }
        return { state: s };
      }
      case "undo": {
        const tx = s.txs.find((x) => x.id === a.txId);
        if (!tx || tx.undone) return { error: "nothing to undo" };
        const p = player(tx.playerId);
        if (p) p.balance = Math.max(0, p.balance - tx.delta);
        tx.undone = true;
        return { state: s };
      }
    }

    if (!isAdmin) return { error: "admin only" };

    switch (a.type) {
      case "addPlayers": {
        const names = Array.isArray(a.names) ? a.names.map(cleanName).filter(Boolean) : [];
        if (!names.length) return { error: "no names" };
        for (const name of names) s.players.push({ id: uid(), name, balance: s.config.startBalance });
        return { state: s };
      }
      case "renamePlayer": {
        const p = player(a.playerId);
        const name = cleanName(a.name);
        if (!p || !name) return { error: "invalid" };
        p.name = name;
        return { state: s };
      }
      case "setBalance": {
        const p = player(a.playerId);
        const v = int(a.balance);
        if (!p || !Number.isFinite(v) || v < 0) return { error: "invalid" };
        p.balance = v;
        return { state: s };
      }
      case "removePlayer": {
        s.players = s.players.filter((p) => p.id !== a.playerId);
        for (const t of s.tables) t.seated = t.seated.filter((id) => id !== a.playerId);
        return { state: s };
      }
      case "addTable": {
        const name = cleanName(a.name);
        if (!name) return { error: "name required" };
        s.tables.push({ id: uid(), name, game: cleanName(a.game) || "other", seated: [] });
        return { state: s };
      }
      case "renameTable": {
        const t = table(a.tableId);
        const name = cleanName(a.name);
        if (!t || !name) return { error: "invalid" };
        t.name = name;
        if (typeof a.game === "string") t.game = cleanName(a.game) || t.game;
        return { state: s };
      }
      case "removeTable": {
        s.tables = s.tables.filter((t) => t.id !== a.tableId);
        return { state: s };
      }
      case "setConfig": {
        const start = int(a.startBalance);
        const big = int(a.bigThreshold);
        if (Number.isFinite(start) && start >= 0) s.config.startBalance = start;
        if (Number.isFinite(big) && big > 0) s.config.bigThreshold = big;
        if (a.phase === "play" || a.phase === "final") s.config.phase = a.phase;
        return { state: s };
      }
      case "reset": {
        // Keep players + tables, restore everyone's balance and clear bookings/seating.
        for (const p of s.players) p.balance = s.config.startBalance;
        for (const t of s.tables) t.seated = [];
        s.txs = [];
        s.config.phase = "play";
        return { state: s };
      }
    }
    return { error: "unknown action" };
  }
}
