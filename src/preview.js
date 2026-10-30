import {validateMove,formatEquations} from './rules.js?v=0.2.65';

// Previews use exactly the same authoritative validator and bonus scoring as "Confirm".
export function describeMovePreview(board, placements = [], finished = false) {
  if (finished) return {state: 'empty', points: null, detail: 'Partie skončila.'};
  if (!Array.isArray(placements) || placements.length === 0)
    return {state: 'empty', points: null, detail: 'Polož čísla na desku'};
  const result = validateMove(board, placements);
  if (!result.valid)
    return {state: 'invalid', points: null, detail: result.reason || 'Tah není platný'};
  return {
    state: 'valid',
    points: result.points,
    detail: formatEquations(result.equations)
  };
}

// A visible, compact counterpart to the score tooltip on the confirm button.
// Used in both local and online match status panels while digits are staged.
export function formatMovePreviewMessage(preview) {
  if(preview?.state==='valid')
    return `Náhled: ${preview.detail} · +${preview.points} bodů. Potvrď nebo uprav.`;
  if(preview?.state==='invalid')return `Náhled: ${preview.detail}`;
  return null;
}
