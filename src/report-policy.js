// A player can send a few snapshots while playing, but the finished match
// always has its own final submission. The same snapshot is never sent twice.
export const REPORT_PARTIAL_LIMIT=3;
export const REPORT_GAP_MS=2*60*1000;

export function reportEligibility(receipts,revision,finished,now=Date.now()){
  const records=Array.isArray(receipts)?receipts:[];
  if(finished){
    const final=records.find(item=>item.finished===true);
    return final?{kind:'sent',id:final.id}:{kind:'ready'};
  }
  const partial=records.filter(item=>item.finished===false);
  const same=partial.find(item=>item.revision===revision);
  if(same)return {kind:'sent',id:same.id};
  if(partial.length>=REPORT_PARTIAL_LIMIT)return {kind:'limit'};
  const last=partial.at(-1);
  if(last&&now-last.at<REPORT_GAP_MS)
    return {kind:'cooldown',retryAt:last.at+REPORT_GAP_MS};
  return {kind:'ready'};
}

export function addReportReceipt(receipts,id,revision,finished,at=Date.now()){
  const records=Array.isArray(receipts)?receipts:[];
  return [...records,{id,revision,finished:Boolean(finished),at}].slice(-4);
}
