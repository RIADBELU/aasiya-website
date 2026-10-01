# Aasiya Musalla — Base44 Dev Environment

## What this is
A static website (HTML/CSS/JS) for a mosque in Regina, Saskatchewan. No backend, no database, no build step. All data (prayer times, announcements) is fetched client-side from a Google Sheet and the AlAdhan API using keys hardcoded in `site.js` / `prayerdisplay.html`.

## Running
```
docker compose -f docker-compose.base44.yml up -d
```
Serves the repo root via nginx on host port 3000. The entry point is `index.html`.

## Key files
- `index.html` + `site.css` + `site.js` — public website
- `prayerdisplay.html` — full-screen TV display for prayer times
- `admin.html` + `admin.css` — password-protected announcement management
- `sw.js` — service worker (caches the site shell)
- `assets/` — images, icons, fonts

## No secrets required
All API keys (Google Sheets, AlAdhan) are embedded in the client-side JavaScript. No external credentials are needed to run the site.
