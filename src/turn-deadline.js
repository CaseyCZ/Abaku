// An absolute wall-clock deadline survives reload and browser tab suspension.
export function createTurnDeadline(seconds, now=Date.now()){
  const duration=Number(seconds);
  return Number.isFinite(duration)&&duration>0 ? now+duration*1000 : null;
}

export function restoreTurnDeadline(savedDeadline, seconds, now=Date.now()){
  // Do not turn an expired saved turn into a fresh one.
  if(typeof savedDeadline==='number'&&Number.isFinite(savedDeadline)&&savedDeadline>0)
    return savedDeadline;
  // Older saves never had a deadline: start a full turn only once on migration.
  return createTurnDeadline(seconds,now);
}
