# Číselná aréna — Abaku retro (PC)

Neoficiální fanouškovská rekonstrukce klasické číselné hry inspirovaná původním Abaku z portálu Hry.cz / Seznam. Cílem je postupně dosáhnout věrného herního zážitku z původní PC hry a připravit základ pro budoucí iOS a Android verze.

 > **Stav:** hlavní nabídka 0.2.0 je v `Master`; herní jádro 0.1.4 je zálohované ve větvi `backup/v0.1.4-stable-2026-10-22`. Online server je v repozitáři, ale ještě není nasazený na Oracle. Nejde o původní hru Geewa/Seznam ani o oficiální aplikaci Abaku. Grafika je nově nakreslená. Název Abaku a původní grafické prvky patří jejich vlastníkům.

### Novinky 0.1.4
- Nad stojánkem se okamžitě přepočítají potenciální body za dosud nepotvrzený tah, včetně bonusů; neplatné a neúplné příklady nemají připsané body.
- Pravý panel je pouze chat hráčů. Automatické události jsou mimo chat a staré systémové zprávy se skryjí; zprávy hráčů zůstanou zachované.
- Chat stále funguje místně pro dva hráče na jednom PC, není to online chat.

### Oprava 0.1.3

- Kameny se po platném tahu i výměně skutečně doplní na stojánek (dokud jsou v sáčku).
- Již uložená rozehraná partie s prázdným stojánkem se při načtení automaticky opraví bez ztráty skóre.
- CSS a herní skript mají verzovanou URL pro načtení aktuální verze bez staré cache prohlížeče.

### Novinky 0.1.1

- Celá PC hra včetně zásobníku a spodních tlačítek se přizpůsobuje výšce okna.
- Hrací deska má pevně dané čtvercové rozměry a nemění výšku řádků při přidávání číslic.
- Čas tahu lze zvolit 30, 60 nebo 90 sekund (staré uložené hodnoty se převedou na 90 sekund).

### Novinky 0.1.3
- Modré zvýraznění označuje právě aktivního hráče, včetně přepínání mezi oběma hráči.
- Nová hra je nahoře a spouští se pouze po potvrzení.
- Nápověda se nabízí pouze při hře proti počítači.
- Vlevo stav partie, poslední příklad, body a posledních šest tahů.
- Vpravo místní chat mezi dvěma hráči na jednom PC (není online).
- Zachováno doplňování pěti kamenů, uložené partie a nastavení 30/60/90 sekund.

### Hlavní nabídka a příprava online hraní (0.2.0)
- Úvodní stránka `index.html` nabídne hru proti AI a místně na jednom PC.
- Dosavadní herní rozhraní je beze změn zachované v `game.html`.
- Uložené partie se zobrazují v nabídce a lze v nich pokračovat.
- Místní přezdívku a avatar lze měnit bez přihlášení.
- Matchmaking, přátelé a Google přihlášení mají připravený kód. **Na Oracle zatím nejsou nasazené**, a proto jsou ve veřejné nabídce vypnuté.
- Google přihlášení používá Google Identity Services (bez Firebase), token ověří Google Auth Library na Oracle Node.js serveru; aktivace vyžaduje Google Client ID a veřejné HTTPS API.
- Nebudeme ukládat hesla ani OAuth tajné klíče do veřejného GitHub repozitáře.
- Funkční verze 0.1.4 zůstává beze změny v záložní větvi. Online část prozatím zůstává neaktivní, dokud nedoplníme konfiguraci.

### Oracle Online API
- Minimalistický Node.js server: `server/index.js`, Node.js 24.15+, WebSockety `ws`, Google tokeny `google-auth-library`.
- SQLite uchovává pouze přezdívky, avatary, statistiky výher/proher/remíz a kontakty přátel.
- Board, kameny, chat a pozvánky jsou v paměti procesu. Server hlídá platnost tahů i skóre.
- Online frontend je připravený v `src/online-client.js`; aktivuje se veřejnou konfigurací `src/online-config.js` **až po bezpečném nasazení API**.
- Detailní návod v [`server/README.md`](server/README.md).

## Spuštění

Hra běží jako statický web. Otevři `index.html` přes lokální HTTP server, například:

```bash
python3 -m http.server 8000
```

Pak otevři `http://localhost:8000` v Chrome, Firefoxu nebo Edge. Offline hra proti AI a na jednom PC nepotřebuje backend ani databázi. Pro online zápasy je potřeba samostatné Oracle API – viz `server/README.md`.

## Co funguje

- retro desktopové rozvržení, červeno-zlatá grafika a číselná deska 15×15;
- tahy až pěti kameny, ovládání kliknutím, vrácení rozložených kamenů;
- rozpoznávání sčítání, odčítání, násobení, dělení a vybraných mocnin bez znamének;
- násobiče na bonusových polích, skóre a automatické doplňování kamenů;
- počítačový soupeř ve třech nastaveních hledání, lokální hra dvou hráčů;
- výměna kamenů, vynechání tahu, časový limit a nápověda;
- ukládání rozehrané partie i nastavení do prohlížeče;
- základní zvuky a pravidla přímo v aplikaci.

## Co je ještě potřeba dopracovat

- přesně porovnat všechny druhy původních příkladů, skórování a výjimky proti pravidlům originálu;
- dokončit AI tak, aby spolehlivě vyhledávala i náročné více-kamenné tahy a byla dobře vyvážená;
- doplnit animace, původní rozložení dalšího menu a vypilovat ilustrace podle archivních snímků;
- vytvořit online lobby, účty, serverovou kontrolu tahů a pozvánky pro multiplayer;
- po stabilizaci webového jádra zpracovat mobilní ovládání, iOS a Android balíčky.

## Struktura

- `index.html`, `style.css` – PC rozhraní;
- `src/rules.js` – nezávislá logika herního plánu, kontroly tahu a bodování;
- `src/ai.js` – vyhledávání tahů robota a nápovědy;
- `src/main.js` – ovládání, stav, ukládání a animace rozhraní;
- `tests/` – kontrolní testy herních pravidel.

## Testy

```bash
npm test
```

## Reference

- [Původní položka Abaku na Seznamu](https://hry.seznam.cz/hra/abaku)
- [Oficiální pravidla Abaku](https://abaku.cz/metodika/deskova-hra)
- [Současná oficiální hra](https://abakuplay.com/)

Projekt je zatím experimentální a není určen k vydávání za oficiální Abaku.
