import {validateMove,formatEquations} from './rules.js';

// Previews use exactly the same authoritative validator and bonus scoring as "Confirm".
export function describeMovePreview(board, placements = [], finished = false) {
  if (finished) return {state: 'empty', points: null, detail: 'Partie skončila.'};
  if (!Array.isArray(placements) || placements.length === 0)
    return {state: 'empty', points: null, detail: 'Polož kameny na desku'};
  const result = validateMove(board, placements);
  if (!result.valid)
    return {state: 'invalid', points: null, detail: result.reason || 'Tah není platný'};
  return {
    state: 'valid',
    points: result.points,
    detail: formatEquations(result.equations)
  };
}
