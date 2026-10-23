import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#ffd23f" },
    secondary: { main: "#ff3d81" },
    success: { main: "#2ee59d" },
    error: { main: "#ff4d4d" },
    info: { main: "#35c4ff" },
    background: { default: "#0b1d12", paper: "#12301f" },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
    h1: { fontWeight: 900 },
    h2: { fontWeight: 900 },
    h3: { fontWeight: 800 },
    button: { fontWeight: 800, textTransform: "none" },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            "radial-gradient(circle at 15% 10%, rgba(255,61,129,.18), transparent 40%), radial-gradient(circle at 85% 90%, rgba(53,196,255,.16), transparent 40%)",
          backgroundAttachment: "fixed",
        },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" } } },
  },
});

/** Per-game accent colour + emoji so tables are instantly recognisable. */
export const GAMES: Record<string, { color: string; emoji: string }> = {
  roulette: { color: "#ff4d4d", emoji: "🎡" },
  blackjack: { color: "#2ee59d", emoji: "🃏" },
  poker: { color: "#35c4ff", emoji: "♠️" },
  dice: { color: "#ff9f1c", emoji: "🎲" },
  slots: { color: "#ff3d81", emoji: "🎰" },
  other: { color: "#b388ff", emoji: "🎯" },
};
export const gameOf = (g: string) => GAMES[g] ?? GAMES.other;
export const fmt = (n: number) => n.toLocaleString("de-DE");
export const fmtDelta = (n: number) => (n > 0 ? "+" : "") + fmt(n);
