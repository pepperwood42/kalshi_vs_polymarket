# Kalshi vs Polymarket Dashboard

Prediction markets dashboard that compares trading volume across Kalshi and Polymarket by timeframe and category.

The project is split into two parts:

- `worker/` — local data worker that runs embedded Dune SQL, builds a normalized snapshot, and saves it to JSON
- `web/` — React frontend that reads the local snapshot from `public/data/dashboard-cache.json`

## What the product shows

- KPI cards for combined volume, Polymarket, Kalshi, and leader spread
- period-over-period delta for `7d`, `30d`, and `90d`
- comparative chart with `Line` and `Bars` modes
- market filter and category filter
- category breakdown showing where each venue wins
- English and Russian localization
- light and dark themes
- CSV export of the currently selected dashboard view

## Architecture

This repository intentionally does not use a traditional backend or database.

Instead:

1. the worker calls the Dune API using an API key from `.env`
2. the worker executes two embedded SQL queries:
   - one for Polymarket
   - one for Kalshi
3. the worker builds a single normalized snapshot
4. the frontend reads only that snapshot

This keeps the Dune API key out of the browser while preserving a simple localhost-friendly setup.

## Data sources

- `Polymarket`: `polymarket_polygon.market_trades` + `polymarket_polygon.market_details`
- `Kalshi`: `kalshi.market_report`

Both platforms are normalized into the same canonical category model:

- `Sports`
- `Crypto`
- `Politics`
- `Geopolitics`
- `Finance`
- `Tech & Science`
- `Culture`
- `Other`

## Timeframes

- `7d` — daily buckets
- `30d` — daily buckets
- `90d` — daily buckets
- `allTime` — monthly buckets

The worker also stores `previous` windows for `7d`, `30d`, and `90d` so the frontend can calculate delta honestly after filters are applied.

## Project structure

```text
worker/
  src/
    refresh-cache.ts
    index.ts
web/
  public/data/dashboard-cache.json
  src/
    App.tsx
    dashboard.ts
    dashboard-ui.tsx
    useDashboardSnapshot.ts
    i18n.tsx
    locale.ts
    types.ts
    styles.css
```

## Setup

Install dependencies:

```bash
yarn --cwd worker
yarn --cwd web
```

Create a worker env file:

```bash
cp worker/.env.example worker/.env
```

Then set:

```bash
DUNE_API_KEY=your_dune_api_key
REFRESH_INTERVAL_HOURS=1
```

## Run locally

Refresh the snapshot once:

```bash
yarn --cwd worker refresh
```

Or run the worker continuously:

```bash
yarn --cwd worker watch
```

Start the frontend:

```bash
yarn --cwd web dev
```

Open the Vite app in your browser, usually at:

```text
http://localhost:5173
```

## Useful commands

```bash
yarn --cwd worker typecheck
yarn --cwd web typecheck
yarn --cwd web build
```

## Snapshot behavior

The frontend does not query Dune directly.

It loads `web/public/data/dashboard-cache.json` and handles these states:

- `loading`
- `waiting`
- `ready`
- `degraded`
- `error`

If the snapshot is not available yet, the UI waits and retries automatically.
If the worker fails after a successful load, the UI keeps showing the last successful snapshot and switches to a degraded state instead of pretending that the data is fresh.

## Notes

- The repository includes a sample snapshot in `web/public/data/dashboard-cache.json` so the UI can be explored immediately.
- The worker can regenerate that snapshot at any time using the current embedded SQL.
- This project was built as a focused fullstack dashboard demo rather than a production deployment.
