# Deployment Guide — OG-EDGE ERP

This app ships as a modular monolith: a Node.js backend + a static React frontend.
Backend persists data in SQLite by default (file at `DB_PATH`). For larger scale, migrate to PostgreSQL.

## 1. Create GitHub repository (one-time)

You have SSH access as `sudovu`. Create the repo on GitHub (web UI: https://github.com/new, name `OG-EDGE-ERP`), then:

```bash
cd "C:\Users\Sudo\OG-EDGE ERP"
git remote add origin git@github.com:sudovu/OG-EDGE-ERP.git
git branch -M main
git push -u origin main
```

## 2. Generic (any Ubuntu server with Docker)

```bash
git clone git@github.com:sudovu/OG-EDGE-ERP.git
cd OG-EDGE-ERP
cp .env.example .env   # set JWT_SECRET
docker compose up -d --build
# app on http://<server>:80
```

## 3. Platform-specific

### Render
Use `render.yaml` (Blueprint). Connect repo → New → Blueprint. Set `JWT_SECRET`.

### Railway
Connect repo → New Project → Deploy from GitHub. Uses `railway.json` / Dockerfile.

### Fly.io
```bash
fly launch --config fly.toml
fly volumes create og_edge_data --region iad
fly deploy
```

### Heroku
```bash
heroku create og-edge-erp
heroku config:set JWT_SECRET=$(openssl rand -hex 32)
git push heroku main
```

### Vercel (frontend only)
Import repo → set root to `frontend`, build command `npm run build`, output `dist`.
Point `VITE_API_BASE_URL` to your backend URL.

### Netlify (frontend only)
Import repo, uses `netlify.toml`. Update backend URL in redirects.

### DigitalOcean App Platform
Use `.do/app.yaml`.

### Google Cloud Run
```bash
gcloud builds submit --config cloudbuild.yaml
```

### AWS (EC2 / ECS)
Use the Docker image from `backend/Dockerfile` behind an ALB with HTTPS.

## Environment variables

| Var | Required | Description |
|-----|----------|-------------|
| PORT | no | default 4000 |
| NODE_ENV | no | production |
| JWT_SECRET | yes (prod) | signing secret |
| DB_PATH | no | SQLite file path |
| CORS_ORIGIN | yes | frontend origin |

## Health check

`GET /health` → `{ success: true, data: { status: "ok" } }`.

## Backups

SQLite file is at `DB_PATH`. Back up regularly:
```bash
sqlite3 /data/og-edge.db ".backup /backups/og-edge-$(date +%F).db"
```

## Notes

- Do not expose the database port publicly.
- For multi-instance scaling, migrate to PostgreSQL and use Redis for sessions/jobs.
- Frontend is a static SPA; any static host works.