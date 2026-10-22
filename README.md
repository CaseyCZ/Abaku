# ✦ ABAKU — Číselná aréna ✦

**Čísla místo slov. Taktika místo náhody.**  
Retro matematická desková hra pro počítač i mobil, ve které z číselných kamenů sestavuješ početní příklady, využíváš bonusová políčka a soupeříš o nejvyšší skóre.

### [▶ HRÁT ABAKU ONLINE](https://caseycz.github.io/Abaku/)

**Bez instalace · V prohlížeči · Proti počítači, ve dvou i přes internet**

> **Neoficiální fanouškovská rekonstrukce inspirovaná původní hrou Abaku.** Nejde o oficiální aplikaci původních autorů ani o původní hru ze Seznamu. Projekt má vlastní webové rozhraní a je průběžně vyvíjen.

---

## 🎮 O hře

Abaku je logická číselná hra na desce **15 × 15 polí**. Místo skládání slov pokládáš číselné kameny tak, aby vznikaly správné matematické příklady — a sbíráš za ně body.

Například tři kameny **2 · 6 · 8** mohou vytvořit příklad **2 + 6 = 8**. Znaménka na desku nepokládáš: hra je rozpozná sama. Podporuje různé početní operace včetně sčítání, odčítání, násobení a dělení.

Čím chytřeji využiješ již položené kameny a bonusová políčka, tím víc bodů můžeš získat jedním tahem.

## ⚔️ Vyber si způsob hraní

| Režim | Jak funguje |
| --- | --- |
| **Proti počítači** | Hraj s AI ve třech obtížnostech: Začátečník, Pokročilý a Expert. |
| **Dva hráči** | Střídejte se na jednom počítači, tabletu nebo telefonu. |
| **Náhodný soupeř online** | Přihlas se přes Google a vyhledej dalšího hráče na internetu. |
| **Online s přítelem** | Přidej si přátele, posílej výzvy a zahraj si soukromou partii. |

**Hra proti počítači a místní hra dvou hráčů fungují bez účtu.** Online multiplayer vyžaduje přihlášení přes Google a dostupný herní server; online režim je stále v **testovacím provozu**.

## 🧩 Jak se hraje

1. Vyber herní režim a začni novou partii.
2. Ze stojánku vybírej číselné kameny a pokládej je na desku. První tah musí vést přes její střed.
3. Slož platný početní příklad. Další tahy musí navazovat na kameny, které už na desce leží.
4. Využívej bonusová pole, potvrď tah a získej body.
5. Střídej se se soupeřem. Po skončení partie uvidíš výsledkové okno s vítězem, konečným skóre a možností odvety.

**Za jeden tah lze položit až pět kamenů.** Hra kontroluje platnost příkladů a nabízí také výměnu kamenů nebo vynechání tahu.

Podrobná pravidla si otevřeš přímo ve hře přes tlačítko **Pravidla**.

## ✨ Co Číselná aréna nabízí

- **Retro styl** — červeno-zlaté rozhraní inspirované klasickými deskovými hrami, přizpůsobené PC i mobilům.
- **Matematické souboje** — různé aritmetické příklady, bonusy, násobiče a průběžné skóre.
- **Animované vyhodnocení** — příklady se po tahu ukazují jeden po druhém a body se automaticky sčítají. Zobrazení lze vypnout nebo nastavit na **2, 3, 5, 8 či 10 sekund**; výchozí hodnota je **3 sekundy**.
- **Zvýraznění posledního tahu** — po vyhodnocení se na desce ukážou právě položené kameny a vytvořené příklady.
- **Vlastní tempo** — čas na tah **30, 60 nebo 90 sekund**, zvuky a další nastavení.
- **Nápověda** — při hraní proti počítači můžeš požádat o návrh tahu.
- **Pokračování v partii** — místní rozehraná hra se ukládá do prohlížeče; online zápas lze obnovit, pokud je stále aktivní na serveru.
- **Výsledková obrazovka** — vítěz, remíza, skóre a možnost **Odveta / Ukončit**.
- **Online komunita** — hráčský profil, statistiky, žebříček, seznam přátel, výzvy a chat.
- **Oznámení ve hře** — upozornění na nové chatové zprávy, odpojení soupeře a pokusy o obnovení spojení.

## 📱 Kde si zahrát

**[caseycz.github.io/Abaku](https://caseycz.github.io/Abaku/)**

Hra běží přímo v moderním webovém prohlížeči. Není potřeba nic instalovat. Místní režimy fungují bez serveru; pro online souboje je potřeba internet a běžící API.

## 🛠️ Pro vývojáře

Číselná aréna je webová aplikace postavená na **HTML, CSS a JavaScriptu bez frontendového frameworku**.

| Součást | Technologie / umístění |
| --- | --- |
| Hlavní nabídka a online hra | `index.html`, `src/lobby.js`, `src/online-client.js` |
| Hra proti počítači a místně ve dvou | `game.html`, `src/main.js` |
| Herní pravidla a bodování | `src/rules.js` |
| Počítačový soupeř | `src/ai.js` |
| Animace bodů a výsledků | `src/score-recap.js`, `score-recap.css`, `result-dialog.css` |
| Online server | `server/` — Node.js, WebSocket, SQLite, Google Identity Services |
| Automatické testy | `tests/`, `server/tests/` |

### Lokální spuštění

Pro hraní bez online serveru stačí lokální HTTP server v kořeni repozitáře:

```bash
python3 -m http.server 8000
```

Pak otevři **http://localhost:8000**.

Pro spuštění testů použij Node.js 24.15+:

```bash
npm test
cd server
npm install
npm test
```

Online server má vlastní konfiguraci a nasazuje se samostatně. Podrobnosti jsou v **[server/README.md](server/README.md)**. Přístupové údaje a privátní konfigurace nepatří do veřejného repozitáře.

## 🚧 Stav projektu

**Číselná aréna je hratelná a průběžně rozvíjená webová hra.** Místní režimy jsou dostupné bez přihlášení, online multiplayer je v testovacím provozu. Ladíme pravidla, chování AI, ovládání na mobilech i stabilitu spojení. Při restartu online serveru mohou rozehrané internetové zápasy skončit, protože stav hry je uložený v jeho paměti.

Nápady, chyby a návrhy na vylepšení můžeš poslat přes **[GitHub Issues](https://github.com/CaseyCZ/Abaku/issues)**.

## 📚 Inspirace a práva

Projekt vznikl jako **neoficiální fanouškovská pocta původnímu Abaku**. Není spojený s autory ani provozovateli originální hry. Název *Abaku*, původní hra a případné původní grafické prvky patří jejich příslušným vlastníkům.

- [Původní Abaku na Seznamu](https://hry.seznam.cz/hra/abaku)
- [Metodika a pravidla Abaku](https://abaku.cz/metodika/deskova-hra)
- [Abaku Play](https://abakuplay.com/)

---

**[▶ Spustit Číselnou arénu](https://caseycz.github.io/Abaku/)** · [Nahlásit chybu nebo navrhnout funkci](https://github.com/CaseyCZ/Abaku/issues)
