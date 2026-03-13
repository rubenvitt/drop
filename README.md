# FüKw Dropzone

Eine minimale Upload-Webapp mit Pocket-ID-geschütztem Admin-Panel und verteilbaren Share-Links.

## Features
- Browser-Login über Pocket ID (OIDC via Better Auth).
- Admin-Panel zum Erzeugen, Anzeigen und Widerrufen von Share-Tokens.
- Admin-Panel mit QR-Code-Vorschau und Download für lokal bekannte Share-Links.
- Direkte Share-Links unter `/u/<token>` für externe Nutzer ohne Pocket-ID-Login.
- Mehrfach-Upload mit Drag & Drop, Hinweis und Kategorie.
- Upload-Härtung: Dateinamen-Sanitizing, atomare Writes, Rate-Limit, parallele Upload-Grenze.
- Persistente Auth-Daten in SQLite unter `/data/auth/better-auth.sqlite`.

## Wichtige Routen
- `GET /`: Öffentliche Welcome-Page mit Token-Eingabe und Pocket-ID-Start.
- `GET /login`: Alias auf die Welcome-Page.
- `GET /app`: Upload-App für eingeloggte Admins.
- `GET /admin`: Token-Verwaltung für eingeloggte Admins.
- `GET /u/<token>`: Upload-App über Share-Link.
- `POST /api/admin/tokens`: Share-Token erstellen.
- `DELETE /api/admin/tokens/:id`: Share-Token widerrufen.
- `GET /api/auth/*`: Better-Auth-Endpunkte inkl. OIDC-Callback.

## Lokaler Start

```bash
cp .env.example .env
pnpm install
pnpm start
```

`pnpm start` führt vor dem Serverstart automatisch `pnpm exec better-auth migrate --config src/auth.js --yes` aus.

## Konfiguration

Siehe `.env.example`. Die wichtigsten Variablen:

- `BETTER_AUTH_SECRET`: Secret für Better Auth.
- `BETTER_AUTH_BASE_URL`: Öffentliche Basis-URL der App, z. B. `https://drop.iuk-ue.de`.
- `POCKET_ID_DISCOVERY_URL`: OIDC Discovery URL deiner Pocket-ID-Instanz.
- `POCKET_ID_CLIENT_ID`
- `POCKET_ID_CLIENT_SECRET`
- `SENTRY_NODE_DSN`: DSN für das Node/Fastify-SDK.
- `SENTRY_ENVIRONMENT`: Sentry-Environment, z. B. `production`.
- `AUTH_DB_PATH=/data/auth/better-auth.sqlite`
- `UPLOAD_DIR=/uploads`
- `META_DIR=/data/meta`

Pocket ID muss einen OIDC-Client für die App haben. Redirect-URI:

```text
${BETTER_AUTH_BASE_URL}/api/auth/oauth2/callback/pocketid
```

Die gewünschte Admin-Gruppe wird in Pocket ID am Client konfiguriert. Die App selbst pflegt dafür in v1 keine lokale Allowlist.

## Docker

```bash
git clone <REPO_URL> /opt/fuekw-dropzone
cd /opt/fuekw-dropzone
cp .env.example .env
sudo mkdir -p /srv/fuekw/drop_inbox
sudo chown -R 1000:1000 /srv/fuekw/drop_inbox
mkdir -p ./data/auth ./data/meta
chown -R "$(id -u)":"$(id -g)" ./data/auth ./data/meta
export DROP_UID=$(id -u) DROP_GID=$(id -g)
docker compose up -d --build
```

Persistente Daten:
- Uploads: `/srv/fuekw/drop_inbox:/uploads`
- Metadaten: `./data/meta:/data/meta`
- Auth/SQLite: `./data/auth:/data/auth`

Wichtig: `./data/auth` muss für den Container-User beschreibbar sein, sonst scheitert der Better-Auth-Migrationsschritt direkt beim Start.

## Sentry

- Das Node-SDK wird beim Start per `node --import ./instrument.mjs src/start.js` vor allen anderen App-Modulen initialisiert.
- Die Browser-Integration wird in `public/sentry-init.js` initialisiert und nutzt den lokal vendorten offiziellen Bundle unter `public/vendor/sentry-browser.bundle.min.js`, weil die App kein Frontend-Bundling verwendet.
- Für Fastify-Tracing und Node-Profiling sind `@sentry/node` und `@sentry/profiling-node` installiert; Browser-Tracing und Replay laufen über die vendorte Bundle-Version `10.43.0`.

## Share-Links

- Neue Share-Links werden im Admin-Panel erzeugt.
- Jeder Link zeigt auf `/u/<token>`.
- Zusätzlich kann der Zugangscode auf der Welcome-Page direkt eingegeben werden.
- Neue Zugangscodes sind kürzer gruppiert und standardmäßig nur für Stunden bis wenige Tage gültig.
- Der Upload-Endpoint wird clientseitig automatisch zu `/u/<token>/upload` aufgelöst.
- Bereits existierende `TOKEN_SECRET`-Links aus der alten Auth werden nicht migriert.

## Tests

```bash
pnpm test
```

## QR-Code

Im Admin-Panel kann für in diesem Browser erzeugte Freigaben direkt ein QR-Code erzeugt und als PNG heruntergeladen werden.

```bash
node scripts/generate-qr.js "https://drop.iuk-ue.de/u/<token>" ./qr/drop.png
```

## Troubleshooting
- **Pocket-ID-Login schlägt fehl**: Discovery-URL, Client-ID, Client-Secret und Redirect-URI prüfen.
- **`better-auth`/SQLite startet nicht**: prüfen, ob `better-sqlite3` gebaut wurde und `AUTH_DB_PATH` beschreibbar ist.
- **413 File too large**: `MAX_FILE_SIZE_MB` erhöhen.
- **415 Disallowed MIME**: `ALLOWED_MIME` ergänzen.
- **Uploads fehlen / EACCES auf `/uploads`**: UID/GID-Mapping und Besitzrechte prüfen.
