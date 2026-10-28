import {SIZE, validateMove} from './rules.js?v=0.2.47';

function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function findMoves(board, rack, limit = 300) {
  const result = [];
  const seen = new Set();
  const existing = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (board[r][c] !== null) existing.push([r,c]);
  }
  const evaluate = placements => {
    const key = placements.map(p => `${p.row}:${p.col}:${p.digit}`).sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    const check = validateMove(board, placements);
    if (check.valid) result.push({placements, points: check.points, equations: check.equations});
  };
  if (!existing.length) {
    const unique = [...new Set(rack)];
    const build = (digits, remaining) => {
      // Two-stone squares and roots are legitimate opening moves.
      if (digits.length >= 2) {
        for (const vertical of [false, true]) {
          for (let offset = 0; offset < digits.length; offset++) {
            evaluate(digits.map((digit,i) => ({row: vertical ? 7 - offset + i : 7, col: vertical ? 7 : 7 - offset + i, digit})));
          }
        }
      }
      if (digits.length >= 5 || result.length > limit) return;
      for (const digit of new Set(remaining)) {
        const next = [...remaining]; next.splice(next.indexOf(digit), 1);
        build([...digits, digit], next);
      }
    };
    for (const d of unique) {
      const left = [...rack]; left.splice(left.indexOf(d), 1);
      build([d], left);
      if (result.length > limit) break;
    }
    return result;
  }

  const spots = new Set();
  for (const [r,c] of existing) {
    for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      for (let n = 1; n <= 3; n++) {
        const nr = r + dr*n, nc = c + dc*n;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === null) spots.add(`${nr}:${nc}`);
      }
    }
  }
  const candidates = shuffle([...spots].map(s => s.split(':').map(Number))).slice(0, 80);
  for (const [r,c] of candidates) {
    for (const digit of new Set(rack)) evaluate([{row:r,col:c,digit}]);
  }
  // Search two-tile additions near a common existing arithmetic expression.
  // This is deliberately bounded, keeping turns quick on slower devices.
  if (result.length < limit) {
    for (const [r,c] of candidates) {
      for (const [dr,dc] of [[0,1],[1,0],[0,-1],[-1,0]]) {
        for (let distance = 1; distance <= 4; distance++) {
          const rr = r + dr*distance, cc = c + dc*distance;
          if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE || board[rr][cc] !== null) continue;
          for (const first of new Set(rack)) {
            const rest = [...rack]; rest.splice(rest.indexOf(first),1);
            for (const second of new Set(rest)) {
              evaluate([{row:r,col:c,digit:first},{row:rr,col:cc,digit:second}]);
            }
          }
          if (result.length > limit) return result;
        }
      }
    }
  }
  return result;
}

export function chooseMove(board, rack, difficulty = 'medium') {
  const moves = findMoves(board, rack, difficulty === 'hard' ? 1000 : 300);
  if (!moves.length) return null;
  moves.sort((a,b) => b.points - a.points);
  if (difficulty === 'hard') return moves[0];
  const pool = difficulty === 'easy' ? moves.slice(Math.max(0,moves.length - 12)) : moves.slice(0, Math.min(8,moves.length));
  return pool[Math.floor(Math.random() * pool.length)];
}
