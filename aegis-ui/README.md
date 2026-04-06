# Aegis UI

Frontend for Aegis C2, built with React + Vite.

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Runtime configuration

The UI reads backend endpoints from:

1. `window.env` (`public/env-config.js`)
2. Vite env variables (`VITE_API_URL`, `VITE_HUB_URL`)
3. Fallback to current origin routes

## Auth

JWT token is stored in browser local storage key: `aegis_token`.
