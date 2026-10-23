import { useState } from "react";
import {
  Alert, Autocomplete, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton,
  MenuItem, Paper, Stack, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import { Podium, Ranking, TableCard, useBigOverlay } from "./components";
import { act, login, savePassword, savedPassword } from "./api";
import { fmt, fmtDelta, gameOf, GAMES } from "./theme";
import type { BigEvent, Role, State } from "./types";

interface Live {
  state: State | null;
  setBigHandler: (fn: (e: BigEvent) => void) => void;
}
export type LiveProps = { live: Live };

const Loading = () => <Typography sx={{ p: 4 }}>Verbinde mit dem Casino… 🎰</Typography>;

// ---------------------------------------------------------------- viewer
export function Viewer({ live }: LiveProps) {
  const { push, overlay } = useBigOverlay(true);
  live.setBigHandler(push);
  const s = live.state;
  if (!s) return <Loading />;
  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      {overlay}
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 900 }}>🏆 Ranking</Typography>
          <Ranking state={s} />
        </Grid>
        <Grid item xs={12} md={6}>
          <Typography variant="h5" sx={{ mb: 1, fontWeight: 900 }}>🎲 Tische</Typography>
          <Grid container spacing={1.5}>
            {s.tables.map((t) => (
              <Grid item xs={12} sm={6} key={t.id}>
                <TableCard state={s} table={t} />
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </Container>
  );
}

// ---------------------------------------------------------------- beamer
export function Beamer({ live }: LiveProps) {
  const { push, overlay } = useBigOverlay();
  live.setBigHandler(push);
  const s = live.state;
  if (!s) return <Loading />;
  const final = s.config.phase === "final";
  return (
    <Box sx={{ p: 3, height: "100vh", overflow: "hidden", boxSizing: "border-box" }}>
      {overlay}
      <Typography sx={{ fontSize: "3rem", fontWeight: 900, textAlign: "center", mb: 2 }} color="primary">
        {final ? "🏁 DAS GROSSE FINALE 🏁" : "🎰 CLOUDFLIGHT CASINO 🎰"}
      </Typography>
      {final ? (
        <Box sx={{ mt: 8 }}>
          <Podium players={s.players} />
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={6}>
            <Ranking state={s} large limit={8} />
          </Grid>
          <Grid item xs={6}>
            <Grid container spacing={2}>
              {s.tables.map((t) => (
                <Grid item xs={6} key={t.id}>
                  <TableCard state={s} table={t} large />
                </Grid>
              ))}
            </Grid>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------- login gate
function useAuth() {
  const [pw, setPw] = useState(savedPassword());
  const [role, setRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);
  if (pw && !checked) {
    setChecked(true);
    login(pw).then((r) => (r ? setRole(r) : (savePassword(""), setPw(""))), () => undefined);
  }
  return {
    pw, role,
    logout: () => { savePassword(""); setPw(""); setRole(null); setChecked(false); },
    submit: async (candidate: string) => {
      const r = await login(candidate);
      if (r) { savePassword(candidate); setPw(candidate); setRole(r); setChecked(true); }
      return r;
    },
  };
}

function Gate({ need, children }: { need: Role; children: (pw: string, logout: () => void) => React.ReactNode }) {
  const auth = useAuth();
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const ok = auth.role === "admin" || (auth.role === "dealer" && need === "dealer");
  if (ok) return <>{children(auth.pw, auth.logout)}</>;
  const go = async () => {
    try {
      setErr((await auth.submit(input)) ? "" : "Falsches Passwort 🙅");
    } catch {
      setErr("Server nicht erreichbar");
    }
  };
  return (
    <Container maxWidth="xs" sx={{ py: 6 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 900, mb: 2 }}>{need === "admin" ? "🛠️ Admin" : "🃏 Dealer"}-Login</Typography>
        {auth.role === "dealer" && need === "admin" && <Alert severity="warning" sx={{ mb: 2 }}>Dafür brauchst du das Admin-Passwort.</Alert>}
        <TextField fullWidth type="password" label="Passwort" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} autoFocus />
        {err && <Alert severity="error" sx={{ mt: 2 }}>{err}</Alert>}
        <Button fullWidth variant="contained" sx={{ mt: 2 }} onClick={go}>Einloggen</Button>
      </Paper>
    </Container>
  );
}

// ---------------------------------------------------------------- dealer
const QUICK = [10, 50, 100, 250, 500];

export function Dealer({ live }: LiveProps) {
  return <Gate need="dealer">{(pw, logout) => <DealerInner pw={pw} logout={logout} state={live.state} />}</Gate>;
}

function DealerInner({ pw, logout, state }: { pw: string; logout: () => void; state: State | null }) {
  const [tableId, setTableId] = useState<string>(() => localStorage.getItem("casino_table") ?? "");
  const [error, setError] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{ playerId: string; delta: number } | null>(null);
  if (!state) return <Loading />;
  const table = state.tables.find((t) => t.id === tableId);
  const run = async (a: Record<string, unknown>) => {
    try { setError(""); await act(pw, a); } catch (e) { setError((e as Error).message); }
  };
  const pick = (id: string) => { setTableId(id); try { localStorage.setItem("casino_table", id); } catch { /* ignore */ } };
  const seated = table ? table.seated.map((id) => state.players.find((p) => p.id === id)).filter((p) => !!p) : [];
  const free = state.players.filter((p) => !table?.seated.includes(p.id));
  const lastTx = table ? [...state.txs].reverse().find((t) => t.tableId === table.id && !t.undone) : undefined;
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? "?";
  const book = (playerId: string, delta: number) => {
    if (!delta) return;
    // Large bookings get a confirmation so a typo (e.g. an extra zero) doesn't trigger a jackpot animation.
    if (Math.abs(delta) >= state.config.bigThreshold) setConfirm({ playerId, delta });
    else run({ type: "adjust", tableId, playerId, delta });
  };

  return (
    <Container maxWidth="sm" sx={{ py: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 900 }}>🃏 Dealer</Typography>
        <Button size="small" onClick={logout}>Logout</Button>
      </Stack>
      <TextField select fullWidth label="Mein Tisch" value={tableId} onChange={(e) => pick(e.target.value)}>
        {state.tables.map((t) => <MenuItem key={t.id} value={t.id}>{gameOf(t.game).emoji} {t.name}</MenuItem>)}
      </TextField>
      {error && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>{error}</Alert>}
      {table && (
        <>
          <Autocomplete
            sx={{ mt: 2 }}
            options={free}
            getOptionLabel={(p) => p.name}
            value={null}
            blurOnSelect
            onChange={(_, p) => p && run({ type: "seat", tableId, playerId: p.id })}
            renderInput={(params) => <TextField {...params} label="➕ Spieler an den Tisch holen" />}
          />
          {lastTx && (
            <Button fullWidth size="small" sx={{ mt: 1 }} onClick={() => run({ type: "undo", txId: lastTx.id })}>
              ↩️ Letzte Buchung rückgängig ({name(lastTx.playerId)} {fmtDelta(lastTx.delta)})
            </Button>
          )}
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {seated.map((p) => p && (
              <Paper key={p.id} sx={{ p: 1.5, borderLeft: `6px solid ${gameOf(table.game).color}` }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Typography sx={{ fontWeight: 800 }}>{p.name}</Typography>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography color="primary" sx={{ fontWeight: 900 }}>{fmt(p.balance)}</Typography>
                    <IconButton size="small" onClick={() => run({ type: "unseat", tableId, playerId: p.id })} aria-label="Vom Tisch entfernen">✖</IconButton>
                  </Stack>
                </Stack>
                <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                  {QUICK.map((q) => <Chip key={"+" + q} label={`+${q}`} color="success" onClick={() => book(p.id, q)} />)}
                </Stack>
                <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
                  {QUICK.map((q) => <Chip key={"-" + q} label={`−${q}`} color="error" onClick={() => book(p.id, -q)} />)}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                  <TextField size="small" type="number" label="Betrag" value={custom[p.id] ?? ""} onChange={(e) => setCustom({ ...custom, [p.id]: e.target.value })} sx={{ flex: 1 }} />
                  <Button variant="contained" color="success" onClick={() => { book(p.id, Math.abs(Number(custom[p.id]) || 0)); setCustom({ ...custom, [p.id]: "" }); }}>Gewinn</Button>
                  <Button variant="contained" color="error" onClick={() => { book(p.id, -Math.abs(Number(custom[p.id]) || 0)); setCustom({ ...custom, [p.id]: "" }); }}>Verlust</Button>
                </Stack>
              </Paper>
            ))}
            {!seated.length && <Typography color="text.secondary">Noch niemand am Tisch.</Typography>}
          </Stack>
        </>
      )}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)}>
        <DialogTitle>Große Buchung bestätigen</DialogTitle>
        <DialogContent>
          <Typography>{confirm && `${name(confirm.playerId)}: ${fmtDelta(confirm.delta)} CFD – das löst die Beamer-Animation aus.`}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Abbrechen</Button>
          <Button variant="contained" onClick={() => { if (confirm) run({ type: "adjust", tableId, ...confirm }); setConfirm(null); }}>Buchen</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

// ---------------------------------------------------------------- admin
export function Admin({ live }: LiveProps) {
  return <Gate need="admin">{(pw, logout) => <AdminInner pw={pw} logout={logout} state={live.state} />}</Gate>;
}

function AdminInner({ pw, logout, state }: { pw: string; logout: () => void; state: State | null }) {
  const [tab, setTab] = useState(0);
  const [names, setNames] = useState("");
  const [tName, setTName] = useState("");
  const [tGame, setTGame] = useState("roulette");
  const [error, setError] = useState("");
  const [start, setStart] = useState("");
  const [big, setBig] = useState("");
  if (!state) return <Loading />;
  const run = async (a: Record<string, unknown>) => {
    try { setError(""); await act(pw, a); } catch (e) { setError((e as Error).message); }
  };
  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" sx={{ fontWeight: 900 }}>🛠️ Admin</Typography>
        <Button size="small" onClick={logout}>Logout</Button>
      </Stack>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }} variant="scrollable">
        <Tab label="Spieler" /><Tab label="Tische" /><Tab label="Spiel" />
      </Tabs>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {tab === 0 && (
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <TextField fullWidth multiline minRows={3} label="Spieler hinzufügen (ein Name pro Zeile)" value={names} onChange={(e) => setNames(e.target.value)} />
            <Button sx={{ mt: 1 }} variant="contained" onClick={async () => { await run({ type: "addPlayers", names: names.split("\n") }); setNames(""); }}>
              Hinzufügen (Startguthaben {fmt(state.config.startBalance)})
            </Button>
          </Paper>
          {state.players.map((p) => (
            <Paper key={p.id} sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ flex: 1, fontWeight: 700 }}>{p.name}</Typography>
              <Typography color="primary" sx={{ fontWeight: 900 }}>{fmt(p.balance)}</Typography>
              <Button size="small" onClick={() => { const v = prompt(`Neues Guthaben für ${p.name}`, String(p.balance)); if (v !== null) run({ type: "setBalance", playerId: p.id, balance: Number(v) }); }}>Guthaben</Button>
              <Button size="small" onClick={() => { const v = prompt("Neuer Name", p.name); if (v) run({ type: "renamePlayer", playerId: p.id, name: v }); }}>Umbenennen</Button>
              <Button size="small" color="error" onClick={() => confirm(`${p.name} löschen?`) && run({ type: "removePlayer", playerId: p.id })}>Löschen</Button>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField label="Tischname" value={tName} onChange={(e) => setTName(e.target.value)} sx={{ flex: 1 }} />
              <TextField select label="Spiel" value={tGame} onChange={(e) => setTGame(e.target.value)} sx={{ minWidth: 160 }}>
                {Object.entries(GAMES).map(([k, g]) => <MenuItem key={k} value={k}>{g.emoji} {k}</MenuItem>)}
              </TextField>
              <Button variant="contained" onClick={async () => { await run({ type: "addTable", name: tName, game: tGame }); setTName(""); }}>Anlegen</Button>
            </Stack>
          </Paper>
          {state.tables.map((t) => (
            <Paper key={t.id} sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
              <Typography sx={{ flex: 1, fontWeight: 700 }}>{gameOf(t.game).emoji} {t.name} ({t.seated.length} Spieler)</Typography>
              <Button size="small" onClick={() => { const v = prompt("Neuer Name", t.name); if (v) run({ type: "renameTable", tableId: t.id, name: v }); }}>Umbenennen</Button>
              <Button size="small" color="error" onClick={() => confirm(`${t.name} löschen?`) && run({ type: "removeTable", tableId: t.id })}>Löschen</Button>
            </Paper>
          ))}
        </Stack>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
              <TextField type="number" label="Startguthaben (neue Spieler / Reset)" defaultValue={state.config.startBalance} onChange={(e) => setStart(e.target.value)} fullWidth />
              <TextField type="number" label="Schwelle für große Gewinne/Verluste" defaultValue={state.config.bigThreshold} onChange={(e) => setBig(e.target.value)} fullWidth />
              <Button variant="contained" onClick={() => run({ type: "setConfig", startBalance: start === "" ? state.config.startBalance : Number(start), bigThreshold: big === "" ? state.config.bigThreshold : Number(big) })}>Speichern</Button>
            </Stack>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography sx={{ mb: 1 }}>Phase: <b>{state.config.phase === "final" ? "Finale (Podium auf dem Beamer)" : "Spielphase"}</b></Typography>
            <Button variant="contained" color="secondary" onClick={() => run({ type: "setConfig", phase: state.config.phase === "final" ? "play" : "final" })}>
              {state.config.phase === "final" ? "Zurück zur Spielphase" : "🏁 Finale starten"}
            </Button>
          </Paper>
          <Paper sx={{ p: 2 }}>
            <Typography sx={{ mb: 1 }}>Alle auf Startguthaben zurücksetzen, Buchungen und Sitzplätze löschen.</Typography>
            <Button variant="outlined" color="error" onClick={() => confirm("Wirklich alles zurücksetzen?") && run({ type: "reset" })}>Reset</Button>
          </Paper>
        </Stack>
      )}
    </Container>
  );
}
