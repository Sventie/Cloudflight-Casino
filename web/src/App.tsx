import { useRef } from "react";
import { HashRouter, Link, Route, Routes, useLocation } from "react-router-dom";
import { AppBar, Box, Button, Chip, Toolbar, Typography } from "@mui/material";
import { serverUrl } from "./api";
import { useCasino } from "./useCasino";
import { Admin, Beamer, Dealer, Viewer } from "./pages";
import type { BigEvent } from "./types";

function Shell() {
  const handler = useRef<(e: BigEvent) => void>();
  const { state, status } = useCasino(serverUrl(), (e) => handler.current?.(e));
  const live = { state, setBigHandler: (fn: (e: BigEvent) => void) => { handler.current = fn; } };
  const beamer = useLocation().pathname === "/beamer";
  return (
    <>
      {!beamer && (
        <AppBar position="sticky" color="transparent" elevation={0} sx={{ backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
          <Toolbar sx={{ gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontWeight: 900, flex: 1 }} color="primary">🎰 Cloudflight Casino</Typography>
            <Button component={Link} to="/" size="small">Live</Button>
            <Button component={Link} to="/dealer" size="small">Dealer</Button>
            <Button component={Link} to="/admin" size="small">Admin</Button>
            <Chip size="small" color={status === "connected" ? "success" : "warning"} label={status === "connected" ? "live" : "verbinde…"} />
          </Toolbar>
        </AppBar>
      )}
      <Box>
        <Routes>
          <Route path="/" element={<Viewer live={live} />} />
          <Route path="/beamer" element={<Beamer live={live} />} />
          <Route path="/dealer" element={<Dealer live={live} />} />
          <Route path="/admin" element={<Admin live={live} />} />
        </Routes>
      </Box>
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  );
}
