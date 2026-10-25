# hatch-demo-bff

Minimal **page + `/api`** app for Hatch to publish from this GitHub repository. Coolify builds the `Dockerfile` and runs one process. Hatch only issues the share link and visitor identity.

## What it does

- `/` — a small page that calls the APIs below
- `GET /healthz` — Coolify / Hatch health check (no login)
- `GET /api/whoami` — echoes Hatch identity headers (`X-Hatch-User`, `X-Hatch-Auth-Mode`)
- `GET /api/check?url=` — server-side fetch of a public `http(s)` URL (not the browser)

API keys for other systems belong in this app's own settings later. This sample has none.

## Run locally

```bash
npm install
npm start
# http://127.0.0.1:3000
```

## Publish from Hatch (once git binding exists)

1. App origin is Coolify.
2. Bind `https://github.com/Meshinfo/hatch-demo-bff` branch `main`.
3. Publish. Hatch asks Coolify to build this Dockerfile and start port 3000.
4. Open the Hatch share link (not the Coolify hostname) if Edge is on.

Until Hatch exposes that bind API, you can create a **public git** application in Coolify yourself: repository URL above, branch `main`, build pack `dockerfile`, port `3000`.
