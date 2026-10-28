# Číselná aréna API – low-resource Oracle Free Tier

The API runs on Oracle as a separate `abaku-api` PM2 process. The web application can still run offline AI games when the API is unavailable. Deployments should restart only this process, without modifying other PM2 services.

## Requirements

- Node.js 24.15+ on Oracle ARM (built-in SQLite)
- NGINX with public HTTPS/WSS reverse proxy
- One Google OAuth **Web application client ID** authorized for the website origin
- Persistent private directory for SQLite (not inside the GitHub repository)
- `npm install --omit=dev` in `server/`

Node's built-in `node:sqlite` removes the need for a native SQLite npm addon. Dependencies: `ws` and `google-auth-library`.

## Security

- The server refuses to start unless `GOOGLE_CLIENT_ID` and `CORS_ORIGIN` are set.
- Private online calls require either a Google ID token verified by the official Google library or a valid revocable device session; public status and leaderboard reads require no login. The server never trusts a submitted nickname/score.
- Google credentials are NOT stored in SQLite. Google `sub` is used only internally; other players receive random public profile IDs, never Google identifiers.
- SQLite stores the nickname, avatar, four counters (games, wins, losses, draws), accepted/pending friend relationships and private in-progress match snapshots.
- Online boards, both private racks, scores, deadlines and audit events are stored in private SQLite `live_matches`. Matchmaking queues, invite codes, pending challenges and chat remain **in RAM only**.
- Game server validates moves independently and determines scoring, countdown, winner and statistics.
- Run it behind HTTPS/WSS with strict allowed origins and client request limits.
- A server restart reloads ongoing matches and gives disconnected players a recovery window; matchmaking/chat and unsent invitations are cleared. Match settlement is idempotent via `settled_matches` and commits the final snapshot together with the result. Failed snapshot writes restore the last committed in-memory board instead of silently accepting an unsaved move.
- Six invalid board moves may be recorded per five-second window for a player; further attempts temporarily return an error without another SQLite write.
- Changing to any public domain requires updating Google authorized JavaScript origins and `CORS_ORIGIN`.

## Dobrovolná kontrola partií

- V nastavení místní i online hry a na výsledkové obrazovce je tlačítko **Odeslat partii ke kontrole**. Nikdy neodesílá nic samo.
- Offline hra si vede soukromou historii umístění kamenů, zamítnutých pokusů, příkladů, skóre a bonusů v uložené partii v prohlížeči. Online server ukládá historii v soukromé SQLite databázi kvůli obnově po restartu; do dobrovolně odeslaného kontrolního reportu se nedávají UID, přezdívky, chat ani přihlašovací tokeny.
- `POST /api/reports` přijímá dobrovolný anonymní offline záznam (max. 256 KiB); `POST /api/reports/online` vyžaduje přihlášení a ID vlastní online partie a vytváří záznam ze serverové historie.
- Samostatný modul `report-audit.js` **nepoužívá** herní validátor: přehrává desku, samostatně vyhodnotí matematiku i sousednost kamenů a přepočítá body/bonusy. Hlásí rozdíly ve vyhodnocení přijatých/zamítnutých tahů.
- Nové partie používají pravidla `classic-powers-roots-linked-powers`: v dalším tahu lze navázat na koncový výsledek staršího příkladu, i mocninou či odmocninou (`112` + `4` → `24`, `5611` + `29` → `1129`). Položení celé neplatné řady `9724` v jednom tahu je nadále zakázané. Starší záznamy `classic-powers-roots-linked`, `classic-powers-roots-strict` a `classic-powers-roots` se přehrávají podle historických pravidel své verze.
- Soubory ukládej **mimo repozitář a mimo webový adresář**. Výchozí soukromá cesta je `/home/ubuntu/abaku-reports`, změnitelná pomocí `ABAKU_REPORT_DIR`; práva složky `0700`, souborů `0600`. Počet uchovávaných reportů je omezen na 500.
- Server soubory maže při spuštění, při každém seznamu a jednou za hodinu, jakmile jsou starší než 24 hodin. Oprávněný správce může soukromě používat `GET /api/reports` a `GET /api/reports/detail?id=<uuid>` s HTTP hlavičkou `Authorization: Bearer <ABAKU_REPORT_ADMIN_TOKEN>`; token musí mít alespoň 32 znaků. Bez tohoto nastavení jsou čtecí cesty uzamčené.
- Přístup do existujícího dashboardu lze připojit pouze ze serverové části dashboardu; **nikdy** nevkládej admin token do veřejné stránky nebo JavaScriptu.
- Běžné vývojové ověření je `npm test` z kořene repozitáře; před produkčním restartem zkontroluj aktivní hráče a stav zálohy. Nasazení nové perzistence poprvé obnovu starých, dosud neuložených RAM partií nezajistí.

## Local smoke tests

```sh
cd server
npm install
npm test
```

To run on the Oracle host **after** you have configured HTTPS and the Google Web Client ID:

```sh
cd /home/ubuntu/abaku-online/server
npm install --omit=dev --no-audit
export GOOGLE_CLIENT_ID='ACTUAL-WEB-CLIENT-ID'
export CORS_ORIGIN='https://caseycz.github.io'
export DB_PATH='/home/ubuntu/abaku-data/abaku.sqlite'
export HOST='127.0.0.1'
export PORT='8790'
node index.js
```

Use a private PM2 ecosystem/environment file; do not store production secrets in the public GitHub repo. No Google **client secret** is required for verifying a Google ID token.

NGINX example, to be adapted to an existing HTTPS virtual host and tested before activation:

```nginx
location /abaku-api/ {
    proxy_pass http://127.0.0.1:8790/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    # Required only when TRUST_PROXY_REAL_IP=1 is enabled in the Node process.
    # Always overwrite the inbound header so browsers cannot spoof another IP.
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 120s;
    proxy_buffering off;
}
```

For this example, REST `/abaku-api/api/me` is mapped to Node `/api/me`; WebSocket `/abaku-api/ws` maps to `/ws`. Set the frontend API base to your actual HTTPS host plus `/abaku-api`.

Authenticated HTTP actions are limited to 180 requests per minute **per
verified player**, so people sharing a school/home NAT IP do not exhaust one
another's quota. Public `/health`, `/api/presence` and leaderboard reads share
a larger per-IP allowance (5000/minute); session exchange and other public
write/report endpoints use a separate 1200/minute per-IP envelope and their
existing stricter report/feedback quotas. WebSocket upgrades have a 3000/minute
per-IP limit and at most 300 concurrent pending authentications; the existing
700-unique-player admission limit still applies after authentication.

For public/guest request limits and WebSocket upgrade limits, configure
`proxy_set_header X-Real-IP $remote_addr;` in the local NGINX proxy location,
then set `TRUST_PROXY_REAL_IP=1` in the private PM2 environment. The server
reads this header only from a loopback peer with explicit opt-in. Never enable
it unless NGINX overwrites the header; an unsanitized incoming `X-Real-IP`
can be forged by a client.

## Online player presence (RAM only)

- `GET /api/presence` – public counters `{online,waiting,refreshSeconds}`; no player details or Google IDs
- `POST /api/presence` – requires valid Google ID token; refreshes the signed-in user's last active time
- `DELETE /api/presence` – requires valid Google ID token; removes the signed-in user's heartbeat (logout)
- Players are deduplicated by internal authenticated UID; absent browser heartbeats expire after 70 seconds. WebSocket-connected users are counted even if their browser timer pauses.
- `waiting` counts only connected, unmatched users who explicitly selected random matchmaking, **not** all players online. Zero waiting does not mean a new opponent cannot join later.
- The client polls every 20 seconds while the lobby is visible, and the presence table lives only in RAM.

## Persistent Google sign-in (PC and iPhone)

Google ID tokens themselves are short-lived (roughly an hour). After the first
verified Google sign-in, `POST /api/session` (authenticated with a **Google ID
token**, never another app session) exchanges it for a random
`abaku_<43 base64url chars>` opaque bearer token. The browser stores only
this device token in `localStorage`, so normal page reloads, closing the
browser and opening a different tab no longer cause re-login. Other devices
require their own initial Google sign-in.

Oracle stores **SHA-256 token hashes only** in SQLite `login_sessions`,
tied to private Google UID with a 30-day expiry. Sessions are extended for
another 30 days on active use once fewer than 20 days remain; no more than
10 sessions per account remain valid. Google ID tokens are verified with the
official Google library at exchange; both REST `Authorization: Bearer`
and initial WebSocket `auth.idToken` accept validated opaque sessions.
`DELETE /api/session` revokes that browser's active device session and
removes its presence; a WebSocket using that exact session is closed as well.
Active WebSockets are also checked periodically for expired or revoked device
sessions. Login sessions survive API restarts because the
SQLite database already persists player accounts.

Do not log the bearer token, append it to URLs, share it, put it in public
commits, or accept it from unapproved website origins. A copied live bearer
token grants the corresponding player's game privileges, so XSS prevention,
HTTPS and Oracle access controls remain important. Private/incognito mode,
browser storage clearing, expired inactivity, explicit logout or a revoked
session will still require a new Google login. Cross-device login sharing is
not intended.

**Deployment**: update the Oracle checkout, preserve the SQLite backup, then
restart `abaku-api` only after existing RAM-only matches have ended (the first
upgrade cannot restore matches created by the earlier version). The schema is
additive (`CREATE TABLE IF NOT EXISTS`), and no new environment variables are
necessary. Subsequent restarts restore saved games without changing client URLs.

## Reconnecting an ongoing online game

- `GET /api/match/current` (authenticated) returns `{match:null}` if this user has no unfinished online match, otherwise a private-to-the-user summary with public nicknames, current score, turn and server deadline. It does **not** expose Google IDs or opponents' rack.
- After page refresh the lobby verifies Google login and checks this endpoint. **Pokračovat v online partii** appears only if the API confirms a still-active match.
- The websocket `auth` action automatically sends `match-state` for an existing match. Resume only sends `sync`, never another `matchmake` or move.
- While a match dialog is open, the client retries interrupted WebSocket connections after **5 seconds**, allows manual retry and uses regular `sync` requests to detect idle/broken connections. A temporary initial `/health` failure also retries after 5 seconds.
- The existing **60-second disconnection grace** remains in force in normal play. After an API restart, both players get up to 24 hours to resume while neither is connected; after the first returns, the other has a fresh 60-second grace to reconnect. An expired unrecovered match is abandoned without changing statistics.
- Game snapshots are kept on Oracle in private SQLite. They are **not** stored in browser `localStorage`, so a refresh never fabricates an online match. Completed snapshots expire after five minutes; chat, queued matchmaking and pending invite codes do not survive an API restart.

## HTTP API

- `GET /health` – lightweight readiness probe, no auth
- `GET /api/leaderboard` – public nickname, avatar and total match statistics
- `GET /api/me` – own authenticated profile
- `POST /api/me` – nickname and avatar
- `GET /api/players?name=<prefix>` – nickname search
- `GET /api/friends` – friends (with boolean `online`, heartbeat or connected socket) and incoming requests
- `POST /api/friends/remove` – body `{"id":"public-player-id"}`; removes only an accepted friendship of the authenticated caller, in both directions. Deploy the updated API with the frontend to enable presence dots and removal.
- `POST /api/friends/request` – body `{"id":"public-player-id"}`
- `POST /api/friends/respond` – body `{"id":"public-player-id","accept":true}`

Use header `Authorization: Bearer <Google ID token>` on authenticated endpoints.

## WebSocket protocol

Open `wss://HOST/abaku-api/ws`, send `{"type":"auth","idToken":"<Google ID token>"}` as the **first** message; never put tokens into query strings/URLs. Server responds with `authenticated` and either `lobby` or `match-state`.

Supported messages: `matchmake`, `cancel-matchmake`, `invite`, `join-invite`, `move` (placements with row, col and rackIndex; digit is derived by server), `pass`, `exchange`, `chat`, `sync`.

`match-state` contains the board, current player, deadline, scores, bag count and **only your own rack**. Other player's rack is hidden.

The websocket authorizes by Google UID and associates the socket with the corresponding user. Reconnect within 60 seconds; after the grace period the active opponent wins by forfeit. If both disconnect, the game is abandoned with no statistics.

## Direct challenges between friends (online 0.2.8)

- In **Moji přátelé** or **Hrát s přítelem**, click **⚔ Vyzvat** beside an accepted friend.
- The inviter opens a WebSocket and creates a server-side invitation for that friend, without copying any code.
- The invitee checks their own authenticated `GET /api/challenges` every ten seconds while the main lobby is visible. The server returns the sender's public nickname, duration, expiry, and a one-time challenge ID, **not the private code**.
- The invitee presses **Přijmout a hrát** or **Odmítnout**. The authenticated `POST /api/challenges/respond` accepts `{"id":"...","accept":true|false}`; only acceptance returns a private game code and the client joins the existing WebSocket match immediately.
- The server validates **accepted friendship** on send and accept; invitation codes, timers, and pending challenges remain only in RAM and expire after ten minutes. Repeated invites are rate limited.
- Legacy **Vytvořit kód** and **Připojit se kódem** remain supported.
- The recipient must have the lobby open and be signed into Google to see the challenge promptly; the challenge is not an email or phone push notification. An Oracle restart clears pending challenges.

## Known limits

The admission limit is 700 unique online players, but this capacity has not been verified by a successful 700-player load test. Offline AI mode still requires no server. Check existing active matches and keep a private SQLite backup before each backend deployment.
