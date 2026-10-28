# Číselná aréna – produkční provoz na Oracle

Web: `https://caseycz.github.io/Ciselna-Arena/`  
GitHub: `CaseyCZ/Ciselna-Arena`, větev `Master`  
Veřejné API: `https://130.61.49.108/arena-api/`  
PM2 služba: `arena-api` (port 8790)

## Čistý start účtů

Po dohodě s vlastníkem začíná online část s prázdnou databází:

- Produkční cesta: `/home/ubuntu/arena-data/arena.sqlite`.
- Nově vydávané přihlašovací relace začínají `arena_`.
- Prohlížeč používá nové klíče nastavení, profilu, her i souhlasu s analytikou.
- Nové účty, přátelství a statistiky se vytvářejí od nuly. Dosavadní data musí nejdřív zůstat v soukromé záloze; nesmějí se převést ani omylem přepsat.

## Bezpečné pořadí změn

1. Ověřit, že nikdo není ve hře, a vytvořit novou ověřenou SQLite zálohu stávající databáze. Uchovávat ji v soukromém adresáři s právy `0700`, soubor s `0600`.
2. Připravit nový checkout `/home/ubuntu/ciselna-arena` z `Master`, a soukromé adresáře `/home/ubuntu/arena-data`, `/home/ubuntu/arena-reports` a `/home/ubuntu/.config/arena`.
3. Před restartem zkontrolovat současný startovací skript PM2 a všechny jeho odkazy na soukromé konfigurace. Připravit novou startovací konfiguraci, která zachová `GOOGLE_CLIENT_ID`, `CORS_ORIGIN`, `TRUST_PROXY_REAL_IP`, `HOST` a `PORT`, nastaví `DB_PATH=/home/ubuntu/arena-data/arena.sqlite` a používá `ARENA_GITHUB_REPO`, `ARENA_GITHUB_ISSUES_TOKEN`, `ARENA_REPORT_DIR`, `ARENA_REPORT_ADMIN_TOKEN` podle skutečných dřívějších oprávnění. Tajné hodnoty neposílat do chatu ani do GitHubu.
4. Teprve poté přepnout jedinou službu PM2 `arena-api` na nový checkout a novou prázdnou databázi; ostatní PM2 služby se nemění. Zkontrolovat nové `DB_PATH`, startovací cestu a `GET /health`.
5. V NGINX ponechat jedinou proxy `location ^~ /arena-api/` přímo na `127.0.0.1:8790/`, se zachovanými hlavičkami pro WebSocket a `X-Real-IP`. Před reloadem provést `sudo nginx -t`; po reloadu ověřit HTTPS health i spojení WSS. Nepřejmenovávat zahrnutý snippet bez kontroly skutečného `include`.
6. Uložit stav `pm2 save` až po všech kontrolách. Staré adresáře a databázi následně pouze archivovat, nikoliv nevratně mazat.

## Google přihlášení

- Google OAuth JavaScript origin zůstává `https://caseycz.github.io`, takže samotná změna cesty webu nevyžaduje nový Client ID.
- V Google Auth Platform → Branding zkontrolovat název **Číselná aréna**, případně údaje o aplikaci.
- Každý se po čistém startu přihlásí znovu; nová databáze vytvoří nové herní profily.

## Kontroly bez zátěžových testů

- `pm2 status`: `arena-api` a všechny ostatní služby online.
- `GET /health`: `{"status":"ok","service":"arena-api"}`.
- `GET /api/presence`: prázdné počítadlo s limitem 700.
- Nezveřejňovat obsah PM2 environmentu, tokenů ani soukromých SQLite souborů.
