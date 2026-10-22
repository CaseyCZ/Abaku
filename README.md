# Číselná aréna — Abaku retro (PC)

Neoficiální fanouškovská rekonstrukce klasické číselné hry inspirovaná původním Abaku z portálu Hry.cz / Seznam. Cílem je postupně dosáhnout věrného herního zážitku z původní PC hry a připravit základ pro budoucí iOS a Android verze.

> **Stav:** první hratelná verze (0.1.0). Nejde o původní hru Geewa/Seznam ani o oficiální aplikaci Abaku. Grafika je nově nakreslená. Název Abaku a původní grafické prvky patří jejich vlastníkům.

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
