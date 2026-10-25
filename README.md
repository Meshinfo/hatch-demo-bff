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

## Publish from Hatch

Origin must be Coolify. Repository must be public `https://github.com/owner/repo`.

```bash
curl -X PUT "$HATCH/api/v1/projects/$PROJECT_ID/source" \
  -H "Authorization: Bearer $HATCH_TOKEN" -H "Content-Type: application/json" \
  -d '{"repository":"https://github.com/Meshinfo/hatch-demo-bff","branch":"main"}'

curl -X POST "$HATCH/api/v1/deploy" \
  -H "Authorization: Bearer $HATCH_TOKEN" -H "Content-Type: application/json" \
  -d "{\"source\":\"git\",\"projectId\":\"$PROJECT_ID\"}"
```

Hatch asks Coolify to clone this repo, build the Dockerfile, and start port 3000. Open the Hatch share link (not the Coolify hostname) if Edge is on.
