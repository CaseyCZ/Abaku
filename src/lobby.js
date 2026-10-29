import {initOnline,getOnlineProfile,updateOnlineProfile} from './online-client.js?v=0.2.50';
import {syncResumeCard} from './resume-card.js?v=0.2.50';
const PROFILE_KEY = 'arena-local-profile-v1';
const GAME_KEY = 'retro-arena-game-v1';
const byId = id => document.getElementById(id);
// Keep the saved chess-pawn value unchanged; force a monochrome glyph on iOS.
const displayAvatar = avatar => avatar === '♟' ? '♟\uFE0E' : (avatar || '✦');

function getSaved(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); }
  catch { return null; }
}
function loadProfile() {
  const value=getSaved(PROFILE_KEY);
  return {
    nickname: typeof value?.nickname === 'string' && value.nickname.trim() ? value.nickname : 'Host',
    avatar: ['✦','♟','★','❖'].includes(value?.avatar) ? value.avatar : '✦'
  };
}
function paintProfile() {
  const {nickname,avatar}=loadProfile();
  byId('welcomeName').textContent=nickname;
  byId('profileName').textContent=nickname;
  byId('profileAvatar').textContent=displayAvatar(avatar);
}
function showSavedGame() {
  const game=getSaved(GAME_KEY);
  const valid=game && !game.finished && Array.isArray(game.board) && Array.isArray(game.players) && game.players.length === 2;
  byId('savedCard').hidden=!valid;
  syncResumeCard();
  if (!valid) return;
  const [a,b]=game.players.map(x=>Number(x.score)||0);
  byId('savedDescription').textContent='Rozehraná partie · skóre '+a+' : '+b+' · tah '+(Number(game.turns||0)+1)+'.';
}
function start(mode) {
  const saved=getSaved(GAME_KEY);
  const active=saved && Array.isArray(saved.board) && !saved.finished &&
    (Number(saved.turns)>0 || (saved.history?.length||0)>0);
  if (active && !confirm('Začít novou partii? Dosavadní rozehraná hra bude nahrazena. Chceš-li v ní pokračovat, použij tlačítko Pokračovat ve hře.')) return;
  window.location.assign('./game.html?start=new&mode='+encodeURIComponent(mode));
}
for(const button of document.querySelectorAll('[data-mode]')){
  button.addEventListener('click',()=>start(button.dataset.mode));
}
for(const id of ['editProfile']){
  byId(id).addEventListener('click',()=>{
    const online=getOnlineProfile();
    const value=online||loadProfile();
    byId('nickname').value=value.nickname;
    byId('avatarSelect').value=value.avatar;
    byId('profileTitle').textContent=online?'Upravit online profil':'Místní profil';
    byId('profileDialogDescription').textContent=online
      ? 'Změna přezdívky a avataru se uloží k účtu a zobrazí na dalších zařízeních.'
      : 'Přezdívka je uložená pouze v tomto zařízení. Nejde o online přihlášení.';
    byId('profileDialog').showModal();
  });
}
byId('profileCancel').addEventListener('click',()=>byId('profileDialog').close());
byId('profileForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const nickname=byId('nickname').value.trim().replace(/\s+/g,' ');
  const avatar=byId('avatarSelect').value;
  if(nickname.length<2 || nickname.length>20) {
    byId('nickname').setCustomValidity('Přezdívka musí mít 2–20 znaků.');
    byId('nickname').reportValidity();return;
  }
  byId('nickname').setCustomValidity('');
  const online=getOnlineProfile();
  if(online){
    try{await updateOnlineProfile(nickname,avatar);}
    catch(error){
      byId('profileDialogDescription').textContent=error.message;
      return;
    }
  }else{
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify({nickname,avatar})); }
    catch { /* Storage can be disabled; keep the menu functional. */ }
    paintProfile();
  }
  byId('profileDialog').close();
});
byId('nickname').addEventListener('input',()=>byId('nickname').setCustomValidity(''));
const planned={
  playRandom:'Pro náhodný online zápas se nejdříve přihlas přes Google v panelu Můj profil. Pokud přihlášení nevidíš, server může být dočasně nedostupný.',
  playFriends:'Pro online partii se přihlas přes Google. Pak vyber přítele ze seznamu a vyzvi ho, případně se připoj pomocí kódu.',
  googleSignIn:'Přihlášení přes Google je dočasně nedostupné. Zkus to prosím za chvíli.'
};
for(const [id,description] of Object.entries(planned)){
  byId(id).addEventListener('click',()=>{
    byId('plannedTitle').textContent=id==='googleSignIn'?'Přihlášení není dostupné':'Přihlášení pro online hru';
    byId('plannedText').textContent=description;
    byId('plannedDialog').showModal();
  });
}
byId('plannedClose').addEventListener('click',()=>byId('plannedDialog').close());
paintProfile();
showSavedGame();
initOnline();
