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

// The server's next turn is not yet running while the online score reveal
// is on screen. Show the full turn length until its authoritative start.
export function remainingOnlineTurnSeconds(state,now=Date.now()){
  if(state.finished)return 0;
  const seconds=Number(state.seconds)||60;
  if(Number.isFinite(state.turnStartsAt)&&now<state.turnStartsAt)return seconds;
  const deadline=Number(state.deadline);
  return Number.isFinite(deadline)?Math.max(0,Math.ceil((deadline-now)/1000)):seconds;
}
