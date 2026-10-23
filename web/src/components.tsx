import { useEffect, useRef, useState } from "react";
import { Avatar, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import type { BigEvent, Player, State, Table } from "./types";
import { fmt, fmtDelta, gameOf } from "./theme";

const MEDALS = ["🥇", "🥈", "🥉"];
const sorted = (players: Player[]) => [...players].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));

/** Live ranking; rows glide to their new position when the order changes. */
export function Ranking({ state, large = false, limit }: { state: State; large?: boolean; limit?: number }) {
  const tableOf = new Map<string, Table>();
  for (const t of state.tables) for (const id of t.seated) tableOf.set(id, t);
  const rows = sorted(state.players).slice(0, limit);
  const prev = useRef(new Map<string, number>());
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});

  useEffect(() => {
    const f: Record<string, "up" | "down"> = {};
    for (const p of state.players) {
      const old = prev.current.get(p.id);
      if (old !== undefined && old !== p.balance) f[p.id] = p.balance > old ? "up" : "down";
    }
    prev.current = new Map(state.players.map((p) => [p.id, p.balance]));
    if (!Object.keys(f).length) return;
    setFlash(f);
    const t = setTimeout(() => setFlash({}), 1800);
    return () => clearTimeout(t);
  }, [state.players]);

  const size = large ? 1.5 : 1;
  return (
    <Stack spacing={large ? 1 : 0.75}>
      {rows.map((p, i) => {
        const seat = tableOf.get(p.id);
        const color = flash[p.id] === "up" ? "success.main" : flash[p.id] === "down" ? "error.main" : "primary.main";
        return (
          <motion.div layout key={p.id} transition={{ type: "spring", stiffness: 380, damping: 32 }}>
            <Paper
              sx={{
                p: large ? 1.5 : 1,
                px: large ? 2.5 : 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                border: "2px solid",
                borderColor: flash[p.id] ? color : i < 3 ? "primary.main" : "transparent",
                transition: "border-color .4s",
              }}
            >
              <Typography sx={{ width: `${2.6 * size}rem`, fontSize: `${1.4 * size}rem`, fontWeight: 900, textAlign: "center" }}>
                {i < 3 ? MEDALS[i] : i + 1}
              </Typography>
              <Avatar sx={{ bgcolor: seat ? gameOf(seat.game).color : "grey.700", width: 36 * size, height: 36 * size, fontWeight: 900 }}>
                {p.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <Typography sx={{ flex: 1, fontSize: `${1.2 * size}rem`, fontWeight: 700 }} noWrap>
                {p.name}
              </Typography>
              {seat && (
                <Chip
                  size={large ? "medium" : "small"}
                  label={`${gameOf(seat.game).emoji} ${seat.name}`}
                  sx={{ bgcolor: gameOf(seat.game).color, color: "#000", fontWeight: 800 }}
                />
              )}
              <Typography sx={{ fontSize: `${1.5 * size}rem`, fontWeight: 900, color, minWidth: `${6 * size}rem`, textAlign: "right", transition: "color .4s" }}>
                {fmt(p.balance)}
              </Typography>
            </Paper>
          </motion.div>
        );
      })}
      {!rows.length && <Typography color="text.secondary">Noch keine Spieler angelegt.</Typography>}
    </Stack>
  );
}

export function TableCard({ state, table, large = false }: { state: State; table: Table; large?: boolean }) {
  const g = gameOf(table.game);
  const seated = table.seated.map((id) => state.players.find((p) => p.id === id)).filter((p): p is Player => !!p);
  const last = [...state.txs].reverse().filter((t) => t.tableId === table.id && !t.undone).slice(0, 3);
  const nameOf = (id: string) => state.players.find((p) => p.id === id)?.name ?? "?";
  return (
    <Paper sx={{ p: large ? 2.5 : 2, borderTop: `8px solid ${g.color}`, height: "100%" }}>
      <Typography sx={{ fontSize: large ? "2rem" : "1.4rem", fontWeight: 900, color: g.color }}>
        {g.emoji} {table.name}
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ my: 1.5, minHeight: 32 }}>
        {seated.length ? (
          seated.map((p) => <Chip key={p.id} label={p.name} size={large ? "medium" : "small"} />)
        ) : (
          <Typography color="text.secondary">Niemand am Tisch</Typography>
        )}
      </Stack>
      {last.map((t) => (
        <Typography key={t.id} sx={{ fontSize: large ? "1.1rem" : ".9rem" }} color={t.delta > 0 ? "success.main" : "error.main"}>
          {nameOf(t.playerId)} {fmtDelta(t.delta)}
        </Typography>
      ))}
    </Paper>
  );
}

/** Top-3 podium for the final phase. */
export function Podium({ players }: { players: Player[] }) {
  const top = sorted(players).slice(0, 3);
  const order = [top[1], top[0], top[2]]; // 2nd, 1st, 3rd
  const heights = [200, 280, 150];
  const places = [1, 0, 2];
  return (
    <Stack direction="row" justifyContent="center" alignItems="flex-end" spacing={2}>
      {order.map((p, i) =>
        p ? (
          <motion.div key={p.id} initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 * (3 - places[i]) }}>
            <Typography align="center" sx={{ fontSize: "2.4rem", fontWeight: 900 }}>
              {MEDALS[places[i]]} {p.name}
            </Typography>
            <Box sx={{ height: heights[i], bgcolor: places[i] === 0 ? "primary.main" : "info.main", color: "#000", borderRadius: "16px 16px 0 0", display: "grid", placeItems: "center", minWidth: 220 }}>
              <Typography sx={{ fontSize: "2.4rem", fontWeight: 900 }}>{fmt(p.balance)}</Typography>
            </Box>
          </motion.div>
        ) : null,
      )}
    </Stack>
  );
}

/** Queue of big win/loss events; shows one banner at a time. Returns the push fn + the element. */
export function useBigOverlay(compact = false) {
  const [queue, setQueue] = useState<BigEvent[]>([]);
  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    if (current.kind === "win") {
      const end = Date.now() + 2500;
      const frame = () => {
        confetti({ particleCount: 6, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors: ["#ffd23f", "#2ee59d", "#ff3d81"] });
        confetti({ particleCount: 6, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors: ["#ffd23f", "#35c4ff", "#ff3d81"] });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
    const t = setTimeout(() => setQueue((q) => q.slice(1)), 4200);
    return () => clearTimeout(t);
  }, [current?.id]);

  const win = current?.kind === "win";
  const overlay = (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ scale: 0.3, opacity: 0, rotate: -6 }}
          animate={win ? { scale: [0.3, 1.15, 1], opacity: 1, rotate: 0 } : { scale: 1, opacity: 1, x: [0, -24, 24, -18, 18, -8, 8, 0] }}
          exit={{ scale: 0.6, opacity: 0, y: 60 }}
          transition={{ duration: 0.7 }}
          style={{ position: "fixed", inset: 0, zIndex: 2000, display: "grid", placeItems: "center", pointerEvents: "none", background: win ? "radial-gradient(circle, rgba(255,210,63,.35), transparent 65%)" : "radial-gradient(circle, rgba(255,40,40,.45), transparent 65%)" }}
        >
          <Box sx={{ textAlign: "center", p: 3, bgcolor: "rgba(0,0,0,.75)", border: "4px solid", borderColor: win ? "primary.main" : "error.main", borderRadius: 6 }}>
            <Typography sx={{ fontSize: compact ? "2rem" : "4rem", fontWeight: 900 }}>{win ? "🎉 JACKPOT! 🎉" : "💸 AUTSCH! 💸"}</Typography>
            <Typography sx={{ fontSize: compact ? "1.6rem" : "3.2rem", fontWeight: 900 }}>{current.playerName}</Typography>
            <Typography sx={{ fontSize: compact ? "2.4rem" : "6rem", fontWeight: 900, lineHeight: 1.1 }} color={win ? "primary.main" : "error.main"}>
              {fmtDelta(current.delta)}
            </Typography>
            <Typography sx={{ fontSize: compact ? "1rem" : "1.8rem" }} color="text.secondary">
              am Tisch {current.tableName}
            </Typography>
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
  return { push: (e: BigEvent) => setQueue((q) => [...q, e].slice(-6)), overlay };
}
