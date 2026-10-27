// Single source of visible application version and release notes.
// Keep package.json in sync; tests verify they match.
export const APP_VERSION = '0.2.7';
export const RELEASE_HISTORY = Object.freeze([
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
