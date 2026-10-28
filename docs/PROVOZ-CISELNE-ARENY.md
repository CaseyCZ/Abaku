# Číselná aréna – provoz na Oracle

Stav po dokončení přejmenování dne 28. 10. 2026.

| Část | Aktuální umístění |
| --- | --- |
| Web (GitHub Pages) | https://caseycz.github.io/Ciselna-Arena/ |
| Zdrojový kód | https://github.com/CaseyCZ/Ciselna-Arena, větev `Master` |
| Checkout na Oracle | `/home/ubuntu/ciselna-arena` |
| API | `https://130.61.49.108/arena-api/` |
| PM2 | `arena-api`, lokální port `8790` |
| Nginx | `/etc/nginx/snippets/arena-api.conf` |
| Databáze | `/home/ubuntu/arena-data/arena.sqlite` |
| Soukromá konfigurace | `/home/ubuntu/.config/arena/` |
| Reporty | `/home/ubuntu/arena-reports/` |
| Zálohy | `/home/ubuntu/arena-backups/` |

Původní verze byla po ověření nové databáze a Google přihlášení **archivována**, nikoliv smazána. Zálohy `legacy-source-20261028`, `legacy-data-20261028` a `legacy-config-20261028` zůstávají soukromé. Nová databáze začala od nuly; staré účty ani statistiky se nepřenášejí.

## Co nasazovat

- **Pouze HTML, CSS, JavaScript a obrázky:** stačí změnu zveřejnit na `Master` a počkat na GitHub Pages. PM2 ani Nginx se nerestartují. Při změně stylů zkontrolovat verze URL souborů kvůli cache prohlížeče.
- **Změna `server/`:** před nasazením zkontrolovat aktivní hráče, ověřeně zálohovat SQLite, stáhnout `Master`, restartovat **jen** `arena-api` a ověřit `/health`.
- **Změna soukromého nastavení:** pouze na serveru, nikdy nepublikovat tokeny, klientské konfigurace s citlivými údaji, PM2 dump ani databázi do GitHubu.
- **Nginx:** upravovat jen při skutečné změně routování; před reloadem vždy `sudo nginx -t`. Staré `/abaku-api/` je záměrně vypnuté.

## Stav serveru – rychlá kontrola

```bash
(
  set -euo pipefail
  curl -fsS http://127.0.0.1:8790/health
  echo
  curl -fsS http://127.0.0.1:8790/api/presence
  echo
  pm2 status
  sudo nginx -t
)
```

Pro veřejné HTTPS zkontrolovat `https://130.61.49.108/arena-api/health`. Odpověď má uvádět `"service":"arena-api"`. Google OAuth používá origin `https://caseycz.github.io`; jeho branding nese název **Číselná aréna**.

## Nasazení backendu bez zátěžových testů

Nejdříve ověřit, že nikdo aktivně nehraje (údaj `online` a `waiting` na `/api/presence` musí být 0). Před restartem vytvořit soukromou SQLite zálohu. Pro běžné nasazení použít celý blok:

```bash
(
  set -euo pipefail
  cd /home/ubuntu/ciselna-arena

  PRESENCE_JSON=$(curl -fsS http://127.0.0.1:8790/api/presence)
  node -e '
    const p = JSON.parse(process.argv[1]);
    if (p.online !== 0 || p.waiting !== 0) {
      console.error("STOP: Jsou připojeni hráči.");
      process.exit(1);
    }
  ' "$PRESENCE_JSON"

  node --input-type=module -e '
    import { DatabaseSync, backup } from "node:sqlite";
    import { chmodSync } from "node:fs";
    const source = "/home/ubuntu/arena-data/arena.sqlite";
    const target = "/home/ubuntu/arena-backups/arena-" +
      new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite";
    const db = new DatabaseSync(source, { readOnly: true });
    try {
      await backup(db, target);
      chmodSync(target, 0o600);
      const copy = new DatabaseSync(target, { readOnly: true });
      try {
        if (copy.prepare("PRAGMA quick_check").get().quick_check !== "ok")
          throw new Error("Záloha je poškozená.");
      } finally {
        copy.close();
      }
      console.log("Záloha OK:", target);
    } finally {
      db.close();
    }
  '

  git fetch origin Master
  git merge --ff-only origin/Master
  pm2 restart arena-api
  curl --retry 8 --retry-connrefused --retry-delay 1 -fsS     http://127.0.0.1:8790/health
  echo
  pm2 status
)
```

Pokud se mění závislosti v `server/package.json`, nejdřív cíleně aktualizovat balíčky v `server/`; běžný `git pull` je sám neinstaluje. Stávající provoz používá `npm install`, které na serveru může lokálně vygenerovat ignorovaný `server/package-lock.json`.

## Bezpečnost a hranice

- PM2 používá `/home/ubuntu/.config/arena/start.sh` a privátní `ecosystem.config.js`.
- Nikdy nekopírovat hodnoty `GOOGLE_CLIENT_ID`, `ARENA_GITHUB_ISSUES_TOKEN`, `ARENA_REPORT_ADMIN_TOKEN`, přihlašovací relace nebo data hráčů do veřejných výpisů.
- Zálohy a původní archiv nemaž bez samostatného rozhodnutí.
- Limit `700` v API je konfigurační maximum, **nikoli potvrzená kapacita zátěžovým testem**.
