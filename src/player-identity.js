// Display-only player identity shared by the online lobby and local game.
// Never use this browser cache to authorize requests or award online points.
const ONLINE_PROFILE_KEY='abaku-online-display-profile-v1';
const LOCAL_PROFILE_KEY='abaku-local-profile-v1';
const DEVICE_SESSION_KEY='abaku-online-device-session-v1';
const LEGACY_GOOGLE_KEY='abaku-online-google-session-v1';

function validName(value){
  return typeof value==='string'&&value.trim().length>=2&&value.trim().length<=20
    &&/^[\\p{L}\\p{N} ._\\-]+$/u.test(value.trim());
}
function readJson(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}
  catch{return null;}
}
export function hasSavedOnlineLogin(){
  try{
    const session=localStorage.getItem(DEVICE_SESSION_KEY);
    if(typeof session==='string'&&/^abaku_[A-Za-z0-9_-]{43}$/.test(session))
      return true;
  }catch{}
  try{
    const legacy=sessionStorage.getItem(LEGACY_GOOGLE_KEY);
    return typeof legacy==='string'&&legacy.length>=100&&legacy.length<=5000;
  }catch{return false;}
}
export function offlinePlayerName(){
  if(hasSavedOnlineLogin()){
    const verified=readJson(ONLINE_PROFILE_KEY);
    if(validName(verified?.nickname))return verified.nickname.trim();
  }
  const local=readJson(LOCAL_PROFILE_KEY);
  return validName(local?.nickname)?local.nickname.trim():'Hráč 1';
}
export function cacheVerifiedOnlineProfile(profile){
  if(!validName(profile?.nickname))return false;
  try{
    localStorage.setItem(ONLINE_PROFILE_KEY,JSON.stringify({
      nickname:profile.nickname.trim(),avatar:profile.avatar||'✦'
    }));
    return true;
  }catch{return false;}
}
export function clearVerifiedOnlineProfile(){
  try{localStorage.removeItem(ONLINE_PROFILE_KEY);}catch{}
}
