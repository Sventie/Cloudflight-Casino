# 🎰 Cloudflight Casino

Live-Punkteverwaltung für den Casino-Abend: Startguthaben (Cloudflight Dollar, CFD) für alle, Dealer buchen
Gewinne/Verluste an ihrem Tisch, alle anderen sehen Ranking und Tische live. Der Beamer zeigt Ranking + Tische mit
Jackpot-/Autsch-Animationen und im Finale ein Podium.

| URL | Wer | Zweck |
|---|---|---|
| `/#/` | alle | Live-Ranking + Tische |
| `/#/beamer` | Beamer | Vollbild mit Animationen (Finale-Phase zeigt Top-3-Podium) |
| `/#/dealer` | Dealer (Passwort) | Tisch wählen, Spieler an den Tisch holen, Gewinn/Verlust buchen, Undo |
| `/#/admin` | Admin (Passwort) | Spieler/Tische verwalten, Startguthaben, Schwelle für „große" Buchungen, Finale, Reset |

## Architektur (Techstack wie in `androiddartapp`)
- `web/` – React + TypeScript + Vite + MUI, auf **GitHub Pages**.
- `server/` – **Cloudflare Worker + Durable Object** (kostenlos), WebSocket für Live-Updates. Lesen ist öffentlich,
  Schreiben nur mit `DEALER_PASS` bzw. `ADMIN_PASS` (HTTP Basic). Der Admin darf alles, was ein Dealer darf.

## Einrichtung
1. **Cloudflare**: kostenlosen Account anlegen, API-Token mit „Edit Cloudflare Workers" erstellen.
2. **GitHub → Settings → Secrets and variables → Actions**
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DEALER_PASS`, `ADMIN_PASS`
3. Auf `main` pushen → Workflow *Deploy server* legt den Worker an. Dessen URL (`https://cloudflight-casino.<account>.workers.dev`)
   als **Variable** `VITE_SERVER_URL` eintragen.
4. **Settings → Pages → Source: GitHub Actions**, dann Workflow *Deploy web* ausführen (`workflow_dispatch`).
5. Seite: `https://<user>.github.io/Cloudflight-Casino/`, Beamer: `…/#/beamer`.

Die Server-URL lässt sich bei Bedarf pro Browser in `localStorage` (`casino_server_url`) überschreiben.

## Lokal entwickeln
```bash
cd server && npm i && cp .dev.vars.example .dev.vars && npx wrangler dev   # http://localhost:8787
cd web && npm i && npm run dev                                             # http://localhost:5173/Cloudflight-Casino/
```

## Ablauf-Tipps
- Vor dem Abend: Admin → Spieler eintragen (ein Name pro Zeile), Tische anlegen/umbenennen, Startguthaben prüfen.
- Buchungen ab der Schwelle (Standard 300 CFD) lösen die Beamer-Animation aus; der Dealer muss sie bestätigen (Tippfehler-Schutz).
- Nach 1,5 h: Admin → Spiel → „Finale starten" zeigt die Top 3 als Podium auf dem Beamer (Quiz o. Ä. live ausspielen).
- Tischideen: Roulette, Blackjack, Poker, Würfel, Rad des Glücks.
