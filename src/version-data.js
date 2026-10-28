// Single source of visible application version and release notes.
// Keep package.json in sync; tests verify they match.
export const APP_VERSION = '0.2.27';
export const RELEASE_HISTORY = Object.freeze([
  {
    version: '0.2.27',
    date: '28. 10. 2026',
    description: 'Na tabletech na výšku jsou Nápověda a Vyměnit vlevo, čísla uprostřed a Vynechat tah vpravo, vše v jedné liště.'
  },
  {
    version: '0.2.26',
    date: '28. 10. 2026',
    description: 'Na telefonech na šířku je stejné rozbalovací Menu jako na výšku; tlačítka Nabídka, Pravidla, Nastavení a Nová hra zůstávají dostupná.'
  },
  {
    version: '0.2.25',
    date: '28. 10. 2026',
    description: 'Na telefonech na šířku větší číslice a čitelnější bonusy, připravená výška celé desky už při otevření a plynulé posouvání stránky.'
  },
  {
    version: '0.2.24',
    date: '27. 10. 2026',
    description: 'Na telefonech na šířku jsou čísla uprostřed; Nápověda a Vyměnit vlevo, Vynechat tah vpravo.'
  },
  {
    version: '0.2.23',
    date: '27. 10. 2026',
    description: 'Na iPhonu na šířku zabírá deska šířku displeje a okno výpočtu bodů má menší rozměry.'
  },
  {
    version: '0.2.22',
    date: '27. 10. 2026',
    description: 'Odstraněný duplicitní zlatý pruh po tahu. Zůstává jedno hlášení pod deskou a zvýraznění položených čísel.'
  },
  {
    version: '0.2.21',
    date: '27. 10. 2026',
    description: 'Čísla skóre bez tmavého podkladu; spodní text a odkazy odstraněny a soukromí i cookies přesunuty do nastavení.'
  },
  {
    version: '0.2.20',
    date: '27. 10. 2026',
    description: 'Počet čísel vycentrovaný pod časomírou; pod ním skóre obou hráčů ve dvou stejně širokých sloupcích.'
  },
  {
    version: '0.2.19',
    date: '27. 10. 2026',
    description: 'Kompaktní skutečně vycentrované skóre s mezerami mezi hráči a dvojtečkou; počet čísel zůstává vlevo na stejné řádce.'
  },
  {
    version: '0.2.18',
    date: '27. 10. 2026',
    description: 'Opravené skóre ve třech sloupcích bez přesunuté dvojtečky a zachovaný čas tahu při obnovení stránky.'
  },
  {
    version: '0.2.17',
    date: '27. 10. 2026',
    description: 'Sáček, Hráč 1 a soupeř v jediném řádku ve třech stejně širokých sloupcích; symetrické skóre a kratší dlouhá jména.'
  },
  {
    version: '0.2.16',
    date: '27. 10. 2026',
    description: 'Jména a skóre hráčů na jednom řádku i na telefonu; dlouhá jména se podle místa zkrátí.'
  },
  {
    version: '0.2.15',
    date: '27. 10. 2026',
    description: 'Skóre vystředěné nezávisle na sáčku; delší jména a vícemístné výsledky se přizpůsobí šířce iPhonu a PC.'
  },
  {
    version: '0.2.14',
    date: '27. 10. 2026',
    description: 'Menší a jemnější označení násobků ×2 a ×3 na bonusových políčkách v místní i online hře.'
  },
  {
    version: '0.2.13',
    date: '27. 10. 2026',
    description: 'Počet čísel v sáčku zarovnaný vlevo; odstraněné duplicitní řádky nad deskou, výpočet bodů zachován.'
  },
  {
    version: '0.2.12',
    date: '27. 10. 2026',
    description: 'Čas uprostřed horní lišty, mobilní Menu, počet čísel před skóre a kompaktní nastavení partie.'
  },
  {
    version: '0.2.11',
    date: '27. 10. 2026',
    description: 'Kompaktní nastavení: přepínače a časy vedle sebe, vysvětlení na rozkliknutí a hlášení problému na konci.'
  },
  {
    version: '0.2.10',
    date: '27. 10. 2026',
    description: 'Sjednocení názvosloví: na hlavní stránce, ve hře i v návodu používáme označení čísla.'
  },
  {
    version: '0.2.9',
    date: '27. 10. 2026',
    description: 'Sjednocené barvy a okraje všech hlavních karet; rozehraná partie zůstává jemně zvýrazněná.'
  },
  {
    version: '0.2.8',
    date: '27. 10. 2026',
    description: 'Vystředění profilu, přihlášení, hráčské aktivity a návodu; zarovnání spodní hrany rozehrané partie na PC.'
  },
  {
    version: '0.2.7',
    date: '27. 10. 2026',
    description: 'Vystředění textů v úvodu, rozehrané partii a kartách herních režimů na hlavní stránce.'
  },
  {
    version: '0.2.6',
    date: '27. 10. 2026',
    description: 'Klávesnicová zkratka pro přeskočení horní navigace na hlavní obsah.'
  },
  {
    version: '0.2.5',
    date: '27. 10. 2026',
    description: 'Vyčištění CSS indikátoru serveru bez změny vzhledu nebo chování hry.'
  },
  {
    version: '0.2.4',
    date: '27. 10. 2026',
    description: 'Místní i online rozehranou partii lze otevřít z jedné karty na úvodní stránce.'
  },
  {
    version: '0.2.3',
    date: '27. 10. 2026',
    description: 'Stejné číslo verze a historie změn v nastavení hlavní stránky i hry.'
  },
  {
    version: '0.2.2',
    date: '27. 10. 2026',
    description: 'Upozornění na nedostupný server a tlačítko pro obnovení připojení.'
  },
  {
    version: '0.2.1',
    date: '27. 10. 2026',
    description: 'Karta rozehrané místní partie na úvodní stránce.'
  },
  {
    version: '0.2.0-dev',
    date: '',
    description: 'Předchozí vývojová verze.'
  }
]);
