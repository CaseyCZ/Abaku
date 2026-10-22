# Abaku Online – Firebase Authentication + Oracle API

## Stav
Tento dokument je plán pro integraci. Zatím nebyl vytvořen Firebase projekt a na Oracle serveru nebyla provedena žádná změna.
Online režimy se v aktuálním vývojovém lobby správně označují jako připravované.

## Volba přihlašování
Použijeme **Firebase Authentication – Google provider**. Hráči proti AI mohou dál pokračovat bez účtu.

1. Vytvořit nový Firebase projekt pro Abaku v https://console.firebase.google.com/.
2. V Authentication / Sign-in method aktivovat poskytovatele Google.
3. V Authentication / Settings / Authorized domains přidat skutečnou doménu, na které poběží Abaku, například `caseycz.github.io`. Konkrétní domény je nutné ověřit v konzoli.
4. Zaregistrovat webovou aplikaci a převzít klientskou Firebase konfiguraci (apiKey, authDomain, projectId, appId). Klientská konfigurace není přístupovým tokenem pro Admin SDK, ale používat ji smí pouze správně nakonfigurovaná aplikace a služby.
5. Na webu použít Firebase Web SDK a `signInWithPopup` (s řešením zablokovaných popupů); následně průběžně získávat krátkodobý Firebase ID token. OAuth flow nikdy nenahrazovat vlastním sběrem Google hesla.
6. Na serveru Oracle používat HTTPS a Firebase Admin SDK: `verifyIdToken(idToken)` a identifikaci podle ověřeného `uid`. Klientská přezdívka ani klientem zaslané skóre nejsou důvěryhodným důkazem identity.
7. Přihlašovací údaje Admin SDK získávat z privátních proměnných prostředí / chráněného souboru mimo public GitHub; nikdy je necommitovat do repo.

Oficiální dokumentace:
- https://firebase.google.com/docs/auth/web/google-signin
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Navržená infrastruktura
```
GitHub Pages (web / budoucí mobilní aplikace)
    ├── Hra proti AI bez přihlášení
    └── Firebase Google Login
             ↓ ID token přes HTTPS
Oracle Ubuntu → NGINX → abaku-api (Node.js pod PM2)
                         ├── Firebase Admin verification
                         ├── Profily / přátelé / pozvánky
                         ├── Matchmaking + WebSocket tahy
                         └── SQLite databáze (záloha a migrace)
```

## API návrh – až bude auth hotové
- `GET /health` – veřejná kontrola stavu procesu, bez citlivých interních detailů
- `GET /api/me` – profil ověřeného uživatele
- `PATCH /api/me` – změna veřejné přezdívky a avataru
- `GET /api/friends` a `POST /api/friends/requests` – přátelství a žádosti
- `POST /api/matchmaking/join` – vstup do čekací fronty
- `POST /api/matches/:id/invite` – pozvánka příteli
- `WebSocket /ws` – autorizované události online zápasu a hráčský chat

## Bezpečnostní zásady
- Server kontroluje každý herní tah stejnou validační logikou jako klient; hráč nemůže zadat libovolné body.
- Server je autoritou pro časomíru, stav zápasu a vyhlášení výsledku.
- Token ověřit při novém spojení / obnovení WebSocket připojení a důsledně kontrolovat oprávnění hráče k partii.
- Používat ochranu proti zahlcení, délkové limity zpráv, povolené originy, bezpečnou správu tajemství a pravidelné zálohování SQLite.
- Citlivé identifikátory a e-maily nesdílet ve veřejných žebříčcích, přezdívky mají být oddělené od Google jména.
- Než registraci aktivujeme, připravit zásady ochrany soukromí a možnost odstranit účet.
- Nová databáze a služba se nasazují samostatně; existující Oracle procesy se nijak nemění.

## Vývojové etapy
1. Lobby 0.2.0 – hotový UI základ, místní profil, hra proti AI a pro dva hráče.
2. Firebase projekt + online přihlášení a ověřování na Oracle.
3. SQLite profily, přátelé a bezpečný online stav.
4. Matchmaking a hra s důvěryhodnými serverovými tahy.
5. Online chat, pozvánky a statistiky.
