import {initOnline} from './online-client.js';
const PROFILE_KEY = 'abaku-local-profile-v1';
const GAME_KEY = 'retro-abaku-game-v1';
const byId = id => document.getElementById(id);

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
  byId('profileAvatar').textContent=avatar;
}
function showSavedGame() {
  const game=getSaved(GAME_KEY);
  const valid=game && Array.isArray(game.board) && Array.isArray(game.players) && game.players.length === 2;
  byId('savedCard').hidden=!valid;
  if (!valid) return;
  const [a,b]=game.players.map(x=>Number(x.score)||0);
  byId('savedDescription').textContent=game.finished
    ? 'Poslední partie skončila · skóre '+a+' : '+b+'.'
    : 'Rozehraná partie · skóre '+a+' : '+b+' · tah '+(Number(game.turns||0)+1)+'.';
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
for(const id of ['profileOpen','editProfile']){
  byId(id).addEventListener('click',()=>{
    const value=loadProfile();
    byId('nickname').value=value.nickname;
    byId('avatarSelect').value=value.avatar;
    byId('profileDialog').showModal();
  });
}
byId('profileCancel').addEventListener('click',()=>byId('profileDialog').close());
byId('profileForm').addEventListener('submit',event=>{
  if (event.submitter?.value === 'cancel') return;
  const nickname=byId('nickname').value.trim().replace(/\s+/g,' ');
  if(nickname.length<2 || nickname.length>20) {
    event.preventDefault();byId('nickname').setCustomValidity('Přezdívka musí mít 2–20 znaků.');
    byId('nickname').reportValidity();return;
  }
  byId('nickname').setCustomValidity('');
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify({nickname,avatar:byId('avatarSelect').value})); }
  catch { /* Storage can be disabled; keep the menu functional. */ }
  paintProfile();
});
byId('nickname').addEventListener('input',()=>byId('nickname').setCustomValidity(''));
const planned={
  playRandom:'Náhodného online soupeře zpřístupníme po nasazení Oracle serveru a ověření účtů.',
  playFriends:'Pozvánky a přátele zpřístupníme po dokončení účtů, databáze a synchronizace zápasů.',
  googleSignIn:'Google přihlášení se aktivuje po nastavení Google OAuth Web Client ID a HTTPS API na Oracle serveru.'
};
for(const [id,description] of Object.entries(planned)){
  byId(id).addEventListener('click',()=>{
    byId('plannedText').textContent=description;
    byId('plannedDialog').showModal();
  });
}
byId('plannedClose').addEventListener('click',()=>byId('plannedDialog').close());
paintProfile();
showSavedGame();
initOnline();
