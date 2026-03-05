# FüKw Dropzone (Docker, produktionsreif & minimal)

Eine extrem einfache Upload-Webapp für lokale Einsatznetze.

## Warum dieser Stack?
- **Node.js + Fastify**: klein, robust, gutes Multipart-Streaming.
- **Vanilla Frontend**: kein Build-Schritt, offline-fähig, leicht wartbar.
- **Docker Compose**: sofort deploybar auf Ubuntu Server.

## Features
- Eine Seite: Drag & Drop, Dateiauswahl, Upload-Fortschritt, Status.
- Mehrfach-Upload (Drag&Drop + File Picker).
- Speicherung nach `/uploads` (Host-Mount z. B. `/srv/fuekw/drop_inbox`).
- Optionale Felder: `hinweis` + `kategorie`.
- Security-Modi per ENV: `none`, `basic`, `token`, `subnet`.
- Upload-Härtung:
  - Filename sanitize
  - Kollisionen via `_1`, `_2`, ...
  - Atomic write (`*.part` -> rename)
  - Rate-Limit pro IP
  - Max. parallele Uploads
- Endpoints: `GET /`, `POST /upload`, `GET /health` (+ `/metrics` placeholder)

## Repo-Struktur

```text
.
├── Caddyfile
├── Dockerfile
├── docker-compose.yml
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── scripts/
│   └── generate-qr.js
├── src/
│   ├── config.js
│   ├── security.js
│   ├── server.js
│   └── utils.js
├── test/
│   └── sanitize.test.js
└── .env.example
```

## GitHub Actions (Docker)

Die Pipeline `.github/workflows/docker.yml` übernimmt:
- `pnpm install --frozen-lockfile` + `pnpm test`
- Docker Build (bei PRs ohne Push)
- Docker Push nach GHCR (`ghcr.io/<owner>/<repo>`) auf `main` und Tags `v*`

## One-liner Deploy (copy/paste)

```bash
git clone <REPO_URL> /opt/fuekw-dropzone && cd /opt/fuekw-dropzone \
&& cp .env.example .env \
&& sudo mkdir -p /srv/fuekw/drop_inbox \
&& sudo chown -R 1000:1000 /srv/fuekw/drop_inbox \
&& docker compose up -d --build
```

## Lokaler Start / Entwicklung

```bash
cp .env.example .env
pnpm install
pnpm start
# http://localhost:8080
```

## ENV Konfiguration

Siehe `.env.example`.

Wichtig:
- `UPLOAD_DIR=/uploads`
- Host mount: `/srv/fuekw/drop_inbox:/uploads`
- `MAX_FILE_SIZE_MB=500`
- `ALLOWED_MIME=...`
- `AUTH_MODE=none|basic|token|subnet`
- `MAX_PARALLEL_UPLOADS=3`
- `RATE_LIMIT_PER_MIN=30`

## Auth / Netzschutz

Empfehlung im FüKw-Netz:
1. `AUTH_MODE=subnet` + `ALLOWED_SUBNETS` sauber setzen.
2. Zusätzlich optional `AUTH_MODE=basic` oder `token` (je nach Betriebskonzept).

Hinweis: immer zusätzlich per Firewall auf interne Netze beschränken.

### Token-Mode Nutzung
- URL: `http://host:8080/u/<TOKEN_SECRET>`
- Upload Endpoint wird im Frontend automatisch auf `/u/<token>/upload` gesetzt.

## Optional TLS mit Caddy

```bash
docker compose --profile tls up -d
```

Setze `CADDY_DOMAIN=drop.iuk-ue.de` und stelle DNS/Tunnel korrekt ein.

## Cloudflare Tunnel (optional)
- Tunnel auf den Service zeigen lassen (`http://dropzone:8080` oder Host-Port).
- Öffentliche URL nur mit `token` oder `basic` nutzen.

## SMB-Freigabe auf denselben Ordner
- Freigabe-Ordner in Samba auf **`/srv/fuekw/drop_inbox`** konfigurieren.
- Damit sehen SMB-Clients sofort die hochgeladenen Dateien.

## Logs
- Upload-Logs laufen über Container-Logs (JSON pro Ereignis).
- Pro Upload: timestamp, ip, filename, size, result.
- Optionale Metadaten JSON pro Datei unter `/data/meta`.

## Tests

```bash
pnpm test
```

## QR-Code (nice to have)

```bash
node scripts/generate-qr.js "https://drop.iuk-ue.de/u/<token>" ./qr/drop.png
```

## Troubleshooting
- **413 File too large**: `MAX_FILE_SIZE_MB` erhöhen.
- **415 Disallowed MIME**: `ALLOWED_MIME` ergänzen.
- **401/403**: Auth-Modus + Credentials/Subnet prüfen.
- **Uploads fehlen**: Host-Mount `/srv/fuekw/drop_inbox` Rechte prüfen.
