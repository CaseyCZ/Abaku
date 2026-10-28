# Přechod na Číselnou arénu – kontrolovaný postup

Nová adresa: `https://caseycz.github.io/Ciselna-Arena/` (ověřena jako dostupná po přejmenování).
Původní adresa: `https://caseycz.github.io/Abaku/` (nespoléhej na automatické přesměrování).

## Připraveno před přejmenováním

- `server/github-issues.js` podporuje oba názvy repozitáře. Výchozím cílem je nyní `CaseyCZ/Ciselna-Arena`.
- Analytika při odvolání souhlasu čistí cookies na staré i nové cestě.
- Google Client ID, `CORS_ORIGIN`, interní `/abaku-api`, databáze, PM2 služba a existující přihlašovací relace se nemění.
- Hlavní odkazy v `README.md` byly po zveřejnění nové adresy přepnuty na `/Ciselna-Arena/`.

## Krok 1 – vlastník repozitáře (dokončeno na GitHubu)

1. Ověř dostupnou zálohu a zkontroluj, že nikdo nemá rozehranou online partii.
2. Na GitHubu otevři **Settings → General → Repository name** a přejmenuj `CaseyCZ/Abaku` na `CaseyCZ/Ciselna-Arena`.
3. V **Settings → Pages** zkontroluj publikování z dosavadní větve a adresu nové stránky.
4. Počítej s tím, že GitHub nepřesměruje původní GitHub Pages projektovou URL automaticky. Staré odkazy na `/Abaku/` bude potřeba přepsat při přepnutí.

## Krok 2 – server Oracle (až po přejmenování)

```bash
cd /home/ubuntu/abaku-online
git status --short
git remote set-url origin https://github.com/CaseyCZ/Ciselna-Arena.git
git fetch origin Master
git merge --ff-only origin/Master
curl -fsS http://127.0.0.1:8790/api/presence
```

Pokud je `online:0` a není rozehraný zápas, přepni cíl hlášení:

```bash
ABAKU_GITHUB_REPO=CaseyCZ/Ciselna-Arena pm2 restart abaku-api --update-env
pm2 save
curl --retry 8 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:8790/health
pm2 env 8 | grep '^ABAKU_GITHUB_REPO:'
```

Neměň `DB_PATH`, neobnovuj starou databázi přes novější a nerestartuj ostatní PM2 procesy. Příkaz `pm2 env 8` předpokládá dosavadní PM2 id 8; při změně procesu použij jeho skutečné id.

## Krok 3 – webové odkazy a Google

- Nová GitHub Pages adresa již odpovídá, odkazy v `README.md` jsou přepnuté. Podle potřeby aktualizuj další externí odkazy a staré záložky/bookmarky.
- V Google Cloud Console otevři **Google Auth Platform → Branding** a uprav název aplikace na **Číselná aréna**. Google může u ověřené aplikace vyžadovat novou kontrolu značky.
- Autorizovaný JavaScriptový origin zůstává `https://caseycz.github.io`; pouhá změna cesty za doménou nevyžaduje nový OAuth Client ID ani úpravu `CORS_ORIGIN`.
- Jestli byla hra přidaná na plochu zařízení, původní zástupce směřující na `/Abaku/` může být potřeba nahradit novým. Manifest používá relativní `id`, `start_url` a `scope`.

## Co zatím nepřejmenovávat

- `/home/ubuntu/abaku-data/abaku.sqlite` a ostatní soukromá data.
- `abaku_` prefix autentizačních tokenů a stávající klíče localStorage (chrání přihlášení a uložené lokální partie).
- Stávající Oracle API URL `https://130.61.49.108/abaku-api` a PM2 službu `abaku-api`. Jde o interní kompatibilní cestu; případnou veřejnou změnu udělej odděleně.

Poznámka: GitHub repozitář už byl přejmenován. Google branding a Oracle konfigurace se aplikováním kódových změn automaticky nezmění.
