# Číselná aréna — Abaku retro (PC)

Neoficiální fanouškovská rekonstrukce klasické číselné hry inspirovaná původním Abaku z portálu Hry.cz / Seznam. Cílem je postupně dosáhnout věrného herního zážitku z původní PC hry a připravit základ pro budoucí iOS a Android verze.

> **Stav:** první hratelná verze (0.1.4). Nejde o původní hru Geewa/Seznam ani o oficiální aplikaci Abaku. Grafika je nově nakreslená. Název Abaku a původní grafické prvky patří jejich vlastníkům.

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

## Spuštění

Hra běží jako statický web. Otevři `index.html` přes lokální HTTP server, například:

```bash
python3 -m http.server 8000
```

Pak otevři `http://localhost:8000` v Chrome, Firefoxu nebo Edge. Alternativně lze nasadit na GitHub Pages; není třeba backend ani databáze.

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
