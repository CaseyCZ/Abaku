// Single source of visible application version and release notes.
// Keep package.json in sync; tests verify they match.
export const APP_VERSION = '0.2.64';
export const RELEASE_HISTORY = Object.freeze([
  {
    version: '0.2.64',
    date: '30. 10. 2026',
    description: 'Náhled příkladů a bodů se ukazuje při každém ručním pokládání čísel v místní i online partii, nejen po Nápovědě. Herní tlačítka mají dotykovou výšku aspoň 44 px. Obnovení stránky během vyhodnocení nespálí čas dalšího tahu a další obnovení ho už neprodlužuje.'
  },
  {
    version: '0.2.63',
    date: '30. 10. 2026',
    description: 'Audit Nastavení: změna voleb v místní hře už neobnoví čas aktuálního tahu; nový časový limit začne platit od dalšího tahu. Nadpisy respektují velikost písma, drobné ovládání má větší dotykové plochy a přepínač Zvuky je vycentrovaný.'
  },
  {
    version: '0.2.62',
    date: '30. 10. 2026',
    description: 'Úvodní Průvodce používá stávající velikost textu z nastavení, má čitelnější a vycentrované nadpisy i tlačítka, větší dotykovou oblast pro skrytí a přesněji vysvětluje hraní bez online soupeře.'
  },
  {
    version: '0.2.61',
    date: '30. 10. 2026',
    description: 'Návod Jak hrát: interaktivní první tah ukazuje správně 32 bodů, texty reagují na stávající volbu velikosti písma a úvod i nadpisy jsou lépe vycentrované. V patičce je jediný odkaz na soukromí.'
  },
  {
    version: '0.2.60',
    date: '30. 10. 2026',
    description: 'Audit úvodní stránky: drobné popisky se zvětšily a používají existující volbu velikosti textu. Offline herní karty zřetelně vysvětlují nedostupnost online hry, žebříček se znovu načte po obnovení spojení a malé odkazy se lépe ovládají dotykem.'
  },
  {
    version: '0.2.59',
    date: '30. 10. 2026',
    description: 'Dokončeno sjednocení velikosti písma také na herních tlačítkách Nápověda, Vyměnit a Vynechat tah. Zůstává nastavitelná velikost textu pro místní i online hru.'
  },
  {
    version: '0.2.58',
    date: '30. 10. 2026',
    description: 'Čitelnější texty v místní i online partii: horní menu, průběh tahů, chat a ovládání. V nastavení je společná volba Běžná / Větší / Největší, která se uloží na zařízení; menší displeje použijí rozbalovací menu.'
  },
  {
    version: '0.2.57',
    date: '30. 10. 2026',
    description: 'Doplněna ikona Přátelé také přímo do horního menu rozehrané online partie; nyní mají ikonky všechny čtyři položky online menu.'
  },
  {
    version: '0.2.56',
    date: '30. 10. 2026',
    description: 'Horní menu všech režimů má ikony pro návrat do nabídky, pravidla a nastavení; místní hra má i ikonu nové hry. Rozestupy ikon jsou zmenšené pro kompaktní hlavičku.'
  },
  {
    version: '0.2.55',
    date: '30. 10. 2026',
    description: 'Texty v nastavení místní i online hry a ve formuláři hlášení jsou vycentrované. Volby přiložení historie a souhlasu mají kratší popisky a při otevření formuláře jsou předvolené.'
  },
  {
    version: '0.2.54',
    date: '30. 10. 2026',
    description: 'Ovládací nabídky na mobilu mají vycentrované položky. Hlavní menu a navigace žebříčku i návodu mají jednoduché srozumitelné ikony; delší text pravidel zůstává čitelně zarovnaný vlevo.'
  },
  {
    version: '0.2.53',
    date: '30. 10. 2026',
    description: 'Na úvodní stránce se pod počty online hráčů zobrazuje první trojice celkového žebříčku s medailemi, přezdívkami a statistikami. Odkaz Jak hrát z horního menu odstraněn; zůstává v průvodci a dole na stránce.'
  },
  {
    version: '0.2.52',
    date: '30. 10. 2026',
    description: 'Nové hráče přivítá stručný průvodce s odkazy na přihlášení, přezdívku, přátele, pravidla, hru proti počítači a nastavení. Lze ho vypnout a kdykoliv znovu otevřít z hlavního menu.'
  },
  {
    version: '0.2.51',
    date: '29. 10. 2026',
    description: 'Na iPhonu a dalších dotykových zařízeních se chat při psaní nepřibližuje; pole i tlačítko Poslat zůstávají vedle sebe také při otevřené klávesnici.'
  },
  {
    version: '0.2.50',
    date: '29. 10. 2026',
    description: 'V online partii se plných 60 sekund dalšího tahu začne odpočítávat až po vyhodnocení příkladů, zobrazení součtu bodů a zvýraznění desky. Čas hlídá server pro oba hráče stejně.'
  },
  {
    version: '0.2.49',
    date: '29. 10. 2026',
    description: 'Aplikace na hlavní obrazovce automaticky načte novou verzi při otevření nebo návratu z pozadí. Během hry a práce v otevřených oknech počká, aby nepřerušila partii.'
  },
  {
    version: '0.2.48',
    date: '29. 10. 2026',
    description: 'Oba vzhledy desky používají společné nové rozmístění bonusů. Do nastavení přibyl klasický modro-zelený vzhled; pravidla i bodování platí shodně v místní a online hře.'
  },
  {
    version: '0.2.47',
    date: '29. 10. 2026',
    description: 'Anonymizovaná historie v přiloženém GitHub dokumentu má přehledné odsazení a řádky. Obsah, ověřování a způsob odesílání zůstávají stejné.'
  },
  {
    version: '0.2.46',
    date: '28. 10. 2026',
    description: 'Anonymizovaná historie partie se ke GitHub hlášení připojuje jako jediný veřejný dokument, bez rozdělování do komentářů. Při odmítnutí přílohy se zobrazí odkaz na vytvořené hlášení a upozornění.'
  },
  {
    version: '0.2.45',
    date: '28. 10. 2026',
    description: 'Zůstává jediné Nahlásit problém. Anonymizovanou historii partie lze po výslovném souhlasu připojit přímo do veřejného GitHub Issue; na serveru se pro hlášení nevytváří nový soukromý soubor.'
  },
  {
    version: '0.2.44',
    date: '28. 10. 2026',
    description: 'Odeslání partie ke kontrole se v místní i online hře jmenuje Prověřit partii a má srozumitelnější vysvětlení. Samostatné Nahlásit problém zůstává beze změny.'
  },
  {
    version: '0.2.43',
    date: '28. 10. 2026',
    description: 'V nastavení na hlavní stránce už se neopakuje sekce Soukromí a cookies, protože jsou odkazy v patičce. Během místní i online partie zůstávají dostupné přímo v nastavení.'
  },
  {
    version: '0.2.42',
    date: '28. 10. 2026',
    description: 'Nastavení na hlavní stránce nyní vysvětluje místní i online hru. Přepínače online obrazovky jsou jasně označené a během online partie zůstává vysvětlení zaměřené jen na online režim.'
  },
  {
    version: '0.2.41',
    date: '28. 10. 2026',
    description: 'Před hledáním náhodného soupeře se ověří rozehraná online partie. Pokud existuje, zobrazí se vysvětlení a hráč může použít stávající tlačítko Pokračovat v online partii.'
  },
  {
    version: '0.2.40',
    date: '28. 10. 2026',
    description: 'Při hledání online soupeře je přímo viditelné tlačítko Zrušit hledání. Počet čekajících se zobrazuje bez tebe samotného, aby jeden vlastní čekající hráč nevypadal jako dostupný soupeř.'
  },
  {
    version: '0.2.39',
    date: '28. 10. 2026',
    description: 'Z karty Náhodný soupeř odstraněn nadbytečný stavový text pod tlačítkem. Počet čekajících hráčů dál zůstává v přehledu Hráči a partie.'
  },
  {
    version: '0.2.38',
    date: '28. 10. 2026',
    description: 'Sjednocený vzhled a texty nastavení: místní hra má vlastní výběr času a vyhodnocení, online partie pevně 60 a 3 sekundy. Oba režimy mají samostatné volby průběhu, chatu a zvuků.'
  },
  {
    version: '0.2.37',
    date: '28. 10. 2026',
    description: 'Opraveno napojování příkladů na starší čísla: celý historický řádek už nemusí tvořit jedinou rovnici. Nově položená čísla musí patřit do společného příkladu a jejich kolmá sousedství musí být platná. Přidány testy tří nahlášených tahů.'
  },
  {
    version: '0.2.36',
    date: '28. 10. 2026',
    description: 'Mezi matematickými příklady v historii tahů a dalších přehledech je za čárkou právě jedna mezera, například (4+2=6), (3²=9). Zápis přidaných čísel (2,6) zůstává bez mezer.'
  },
  {
    version: '0.2.35',
    date: '28. 10. 2026',
    description: 'Historie tahů ukazuje číslo tahu, hráče, přidaná čísla a body bez oddělovacích teček, například 2. tah Počítač (2,6) +34b (4+2=6). Příklady jsou kompaktní ve vlastních závorkách a při více příkladech oddělené jedinou čárkou: (6+3=9),(3²=9).'
  },
  {
    version: '0.2.34',
    date: '28. 10. 2026',
    description: 'Mezi více matematickými příklady v průběhu partie, posledních tazích a dalších přehledech jsou místo oddělovací tečky dvě viditelné mezery. Oddělovače hráčů a bodů se nemění.'
  },
  {
    version: '0.2.33',
    date: '28. 10. 2026',
    description: 'Navazující tah může z koncového výsledku vytvořit i mocninu nebo odmocninu: na starší 112 (1 + 1 = 2) položíš 4 a započítá se 24 (2² = 4). Celé 1124 nebo 9724 položené v jednom tahu zůstává neplatné. Aktualizovány testy i nezávislá kontrola partií.'
  },
  {
    version: '0.2.32',
    date: '28. 10. 2026',
    description: 'Nový tah smí navázat na výsledek předchozího příkladu: k 5 + 6 = 11 lze přidat 2 a 9, čímž vznikne 11 − 2 = 9. Další nové platné příklady se také bodují. Chybné 9724 nadále neprojde; aktualizována kontrola partií.'
  },
  {
    version: '0.2.31',
    date: '28. 10. 2026',
    description: 'Opraveno uznávání tahů: celá nepřerušená řada musí nejdříve tvořit platný příklad (např. 9724 se neuzná). Teprve potom se v ní hledají a bodují další kratší příklady. Stejné pravidlo platí pro počítač, online hru a nové kontroly partií.'
  },
  {
    version: '0.2.30',
    date: '28. 10. 2026',
    description: 'Na PC a tabletech na šířku je čas přesně uprostřed bez zvětšení; levé ovládání i pravý průběh partie a chat dynamicky využívají volnou šířku, deska se nezmenšuje.'
  },
  {
    version: '0.2.29',
    date: '28. 10. 2026',
    description: 'Na PC a tabletech na šířku je skóre s časem nahoře, deska je co největší uprostřed, kompaktní čísla a tlačítka vlevo a průběh partie s chatem vpravo.'
  },
  {
    version: '0.2.28',
    date: '28. 10. 2026',
    description: 'Na tabletech na výšku jsou všechna tři akční tlačítka v jedné nižší řadě s čísly, s menšími rámečky a místem pro desku bez posouvání ovládání.'
  },
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
