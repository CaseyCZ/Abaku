# Abaku API – low-resource Oracle Free Tier

Server side is **implemented but not yet deployed**. Web application on GitHub Pages may continue to run offline AI games without the API. This is an isolated process and does not modify any existing PM2 services or NGINX sites.

## Requirements

- Node.js 24.15+ on Oracle ARM (built-in SQLite)
- NGINX with public HTTPS/WSS reverse proxy
- One Google OAuth **Web application client ID** authorized for the website origin
- Persistent private directory for SQLite (not inside the GitHub repository)
- `npm install --omit=dev` in `server/`

Node's built-in `node:sqlite` removes the need for a native SQLite npm addon. Dependencies: `ws` and `google-auth-library`.

## Security

- The server refuses to start unless `GOOGLE_CLIENT_ID` and `CORS_ORIGIN` are set.
- All online calls require a Google ID token verified by the official Google library; the server never trusts a submitted nickname/score.
- Google credentials are NOT stored in SQLite. Google `sub` is used only internally; other players receive random public profile IDs, never Google identifiers.
- SQLite stores the nickname, avatar, four counters (games, wins, losses, draws), and accepted/pending friend relationships.
- Online boards, private racks, opponent matching, invite codes and chat exist **in RAM only**.
- Game server validates moves independently and determines scoring, countdown, winner and statistics.
- Run it behind HTTPS/WSS with strict allowed origins and client request limits.
- A server restart ends ongoing matches and clears matchmaking/chat; persisted profile statistics remain.
- Changing to any public domain requires updating Google authorized JavaScript origins and `CORS_ORIGIN`.

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
    proxy_read_timeout 120s;
    proxy_buffering off;
}
```

For this example, REST `/abaku-api/api/me` is mapped to Node `/api/me`; WebSocket `/abaku-api/ws` maps to `/ws`. Set the frontend API base to your actual HTTPS host plus `/abaku-api`.

## Online player presence (RAM only)

- `GET /api/presence` – public counters `{online,waiting,refreshSeconds}`; no player details or Google IDs
- `POST /api/presence` – requires valid Google ID token; refreshes the signed-in user's last active time
- `DELETE /api/presence` – requires valid Google ID token; removes the signed-in user's heartbeat (logout)
- Players are deduplicated by internal authenticated UID; absent browser heartbeats expire after 70 seconds. WebSocket-connected users are counted even if their browser timer pauses.
- `waiting` counts only connected, unmatched users who explicitly selected random matchmaking, **not** all players online. Zero waiting does not mean a new opponent cannot join later.
- The client polls every 20 seconds while the lobby is visible, and the presence table lives only in RAM.

## Reconnecting an ongoing online game

- `GET /api/match/current` (authenticated) returns `{match:null}` if this user has no unfinished online match, otherwise a private-to-the-user summary with public nicknames, current score, turn and server deadline. It does **not** expose Google IDs or opponents' rack.
- After page refresh the lobby verifies Google login and checks this endpoint. **Pokračovat v online partii** appears only if the API confirms a still-active match.
- The websocket `auth` action automatically sends `match-state` for an existing match. Resume only sends `sync`, never another `matchmake` or move.
- While a match dialog is open, the client retries interrupted WebSocket connections after **5 seconds**, allows manual retry and uses regular `sync` requests to detect idle/broken connections. A temporary initial `/health` failure also retries after 5 seconds.
- The existing **60-second disconnection grace** remains in force. If the opponent is still playing and the client cannot reconnect before this grace elapses, the server awards a forfeit. Restarting the API clears active games; those cannot be resumed.
- These match-resume states live in server RAM, **not** in browser `localStorage`, so a refresh or tab recovery never fabricates an online match.

## HTTP API

- `GET /health` – lightweight readiness probe, no auth
- `GET /api/leaderboard` – public nickname, avatar and total match statistics
- `GET /api/me` – own authenticated profile
- `POST /api/me` – nickname and avatar
- `GET /api/players?name=<prefix>` – nickname search
- `GET /api/friends` – friends and incoming requests
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

This is the foundation for a small number of concurrent matches; it has not been load-tested. Offline AI mode still requires no server. Online frontend controls and end-to-end Google login must be tested after the Google client ID and HTTPS endpoint are configured. Don't expose this unfinished API publicly before performing the deployment/security checks.
