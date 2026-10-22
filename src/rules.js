export const SIZE = 15;
export const RACK_SIZE = 5;
export const TOTAL_TILES = 110;

export const BONUS = Object.freeze({
  NONE: '', DOUBLE_DIGIT: 'dd', TRIPLE_DIGIT: 'td',
  DOUBLE_EXAMPLE: 'de', TRIPLE_EXAMPLE: 'te',
});

// The bonus layout is mirrored through the centre, as on the classic board.
const specials = new Map();
function mark(row, col, type) {
  for (const [r, c] of [[row, col], [row, 14 - col], [14 - row, col], [14 - row, 14 - col]]) {
    specials.set(`${r}:${c}`, type);
  }
}
for (const [r, c] of [[0, 0], [0, 7], [7, 0], [7, 7]]) mark(r, c, BONUS.TRIPLE_EXAMPLE);
for (const [r, c] of [[0, 3], [2, 2], [3, 0], [4, 4], [5, 5], [6, 6]]) mark(r, c, BONUS.TRIPLE_DIGIT);
for (const [r, c] of [[1, 4], [2, 6], [3, 3], [4, 1], [5, 7], [6, 2]]) mark(r, c, BONUS.DOUBLE_DIGIT);
for (const [r, c] of [[1, 1], [2, 7], [3, 5], [4, 3], [5, 2], [6, 4]]) mark(r, c, BONUS.DOUBLE_EXAMPLE);
export const bonusAt = (row, col) => specials.get(`${row}:${col}`) || BONUS.NONE;

export const emptyBoard = () => Array.from({length: SIZE}, () => Array(SIZE).fill(null));

export function makeBag(random = Math.random) {
  const bag = Array.from({length: TOTAL_TILES}, (_, i) => i % 10);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function drawTiles(bag, rack, count = RACK_SIZE) {
  const next = [...rack];
  while (next.length < count && bag.length) next.push(bag.pop());
  return next;
}

// Unlike drawTiles, this updates the player's rack in place at the game-state level.
// Callers cannot accidentally discard the replacement tiles by ignoring a return value.
export function replenishPlayerRack(bag, player) {
  player.rack = drawTiles(bag, Array.isArray(player.rack) ? player.rack : []);
}

// Exactly the same accepted equations as before, now also exposing which
// operation was recognised. Board tiles still contain only digits.
export function formatEquation(sequence) {
  if (!/^\d{3,9}$/.test(sequence)) return null;
  for (let aEnd = 1; aEnd <= Math.min(3, sequence.length - 2); aEnd++) {
    for (let bEnd = aEnd + 1; bEnd <= Math.min(aEnd + 3, sequence.length - 1); bEnd++) {
      const parts = [sequence.slice(0, aEnd), sequence.slice(aEnd, bEnd), sequence.slice(bEnd)];
      if (parts.some(s => s.length > 1 && s[0] === '0')) continue;
      const [a, b, c] = parts.map(Number);
      if (c === 0 || a === 0 || b === 0) continue;
      if (a + b === c) return `${a} + ${b} = ${c}`;
      if (a - b === c) return `${a} − ${b} = ${c}`;
      if (a * b === c) return `${a} × ${b} = ${c}`;
      if (a / b === c && b !== 0) return `${a} ÷ ${b} = ${c}`;
      if ((b === 2 || b === 3) && a ** b === c) return `${a}^${b} = ${c}`;
    }
  }
  return null;
}
export function readsAsEquation(sequence) {
  return formatEquation(sequence) !== null;
}
export function formatEquations(sequences,limit=3){
  return (Array.isArray(sequences)?sequences:[]).slice(0,limit)
    .map(text=>formatEquation(text)||String(text)).join(' · ');
}

function id(row, col) { return `${row}:${col}`; }
function getRuns(board, axis, index) {
  const runs = [];
  let run = [];
  for (let j = 0; j <= SIZE; j++) {
    const row = axis === 'row' ? index : j;
    const col = axis === 'row' ? j : index;
    const value = j < SIZE ? board[row][col] : null;
    if (value !== null) run.push({row, col, digit: value});
    else if (run.length) { runs.push(run); run = []; }
  }
  return runs;
}

function findNewEquations(board, newIds) {
  const rows = new Set();
  const cols = new Set();
  for (const key of newIds) {
    const [r, c] = key.split(':').map(Number);
    rows.add(r); cols.add(c);
  }
  const equations = [];
  for (const [axis, indices] of [['row', rows], ['col', cols]]) {
    for (const index of indices) {
      for (const run of getRuns(board, axis, index)) {
        for (let start = 0; start < run.length; start++) {
          for (let end = start + 3; end <= Math.min(run.length, start + 9); end++) {
            const cells = run.slice(start, end);
            if (!cells.some(p => newIds.has(id(p.row, p.col)))) continue;
            if (readsAsEquation(cells.map(p => p.digit).join(''))) {
              equations.push({axis, cells, text: cells.map(p => p.digit).join('')});
            }
          }
        }
      }
    }
  }
  return equations;
}

export function validateMove(board, placements) {
  if (!Array.isArray(placements) || placements.length < 1 || placements.length > RACK_SIZE)
    return {valid: false, reason: 'Polož 1 až 5 kamenů.'};
  const keys = new Set();
  for (const p of placements) {
    if (!Number.isInteger(p.row) || !Number.isInteger(p.col) || p.row < 0 || p.col < 0 || p.row >= SIZE || p.col >= SIZE || !Number.isInteger(p.digit) || p.digit < 0 || p.digit > 9 || board[p.row]?.[p.col] !== null)
      return {valid: false, reason: 'Kámen nelze položit na toto pole.'};
    const key = id(p.row, p.col);
    if (keys.has(key)) return {valid: false, reason: 'Na jednom poli může být jen jeden kámen.'};
    keys.add(key);
  }
  const horizontal = placements.every(p => p.row === placements[0].row);
  const vertical = placements.every(p => p.col === placements[0].col);
  if (!horizontal && !vertical) return {valid: false, reason: 'Kameny musí ležet v jedné řadě nebo sloupci.'};
  const next = board.map(row => [...row]);
  for (const p of placements) next[p.row][p.col] = p.digit;
  const index = horizontal ? placements[0].row : placements[0].col;
  const coords = placements.map(p => horizontal ? p.col : p.row);
  for (let i = Math.min(...coords); i <= Math.max(...coords); i++) {
    if ((horizontal ? next[index][i] : next[i][index]) === null)
      return {valid: false, reason: 'Mezi novými kameny nesmí být prázdné pole.'};
  }
  const hasOld = board.some(row => row.some(v => v !== null));
  if (!hasOld && !keys.has('7:7')) return {valid: false, reason: 'První tah musí procházet středem.'};
  if (hasOld && !placements.some(p => [[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc]) => {
    const r = p.row + dr, c = p.col + dc;
    return r >= 0 && c >= 0 && r < SIZE && c < SIZE && board[r][c] !== null;
  }))) return {valid: false, reason: 'Nový tah musí navazovat na položené kameny.'};

  const equations = findNewEquations(next, keys);
  if (!equations.length) return {valid: false, reason: 'Nevznikl žádný platný početní příklad.'};
  const covered = new Set(equations.flatMap(eq => eq.cells.map(p => id(p.row,p.col))));
  if (placements.some(p => !covered.has(id(p.row,p.col))))
    return {valid: false, reason: 'Každý nový kámen musí být součástí příkladu.'};

  // Newly adjacent tiles must belong to a common recognised example.
  for (const p of placements) {
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const r = p.row + dr, c = p.col + dc;
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE || next[r][c] === null) continue;
      if (!equations.some(eq => eq.cells.some(x => x.row === p.row && x.col === p.col) && eq.cells.some(x => x.row === r && x.col === c))) {
        return {valid: false, reason: 'Sousední kameny musí tvořit platný příklad.'};
      }
    }
  }
  let points = 0;
  for (const eq of equations) {
    let wordMultiplier = 1, sum = 0;
    for (const cell of eq.cells) {
      const fresh = keys.has(id(cell.row, cell.col));
      const bonus = fresh ? bonusAt(cell.row, cell.col) : '';
      sum += cell.digit * (bonus === 'dd' ? 2 : bonus === 'td' ? 3 : 1);
      if (bonus === 'de') wordMultiplier *= 2;
      if (bonus === 'te') wordMultiplier *= 3;
    }
    points += sum * wordMultiplier;
  }
  return {valid: true, points, board: next, equations: equations.map(e => e.text),
    equationCells: [...new Map(equations.flatMap(eq => eq.cells)
      .map(cell => [id(cell.row,cell.col),{row:cell.row,col:cell.col}])).values()]};
}
