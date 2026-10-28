import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const page=file('../index.html');
const css=file('../arena-home.css');
const shared=file('../shared-game-settings.css');
const start=page.indexOf('<dialog id="onlineGameSettingsDialog"');
const end=page.indexOf('</dialog>',start);
const html=page.slice(start,end);

test('online uses shared compact styling with its own visibility and sound switches',()=>{
  assert.ok(start>=0&&end>start);
  assert.match(html,/<div class="game-settings-toggles" role="group" aria-label="Zobrazení a zvuk">/);
  assert.match(html,/<div class="online-game-settings-body game-settings-body">/);
  assert.match(html,/<h2 id="onlineGameSettingsTitle">Nastavení partie<\/h2>/);
  assert.match(page,/href="\.\/shared-game-settings\.css\?v=[\w.-]+"/);
  for(const id of ['onlineHistorySetting','onlineChatSetting','onlineSoundSetting']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' must remain present once');
  }
  assert.doesNotMatch(html,/id="onlineTurnSeconds"|id="onlineRecapSeconds"/);
  assert.match(shared,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.game-settings-toggles/);
  assert.match(shared,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.game-settings-fields/);
  assert.match(shared,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.game-settings-fields \.game-settings-field select/);
});

test('help, game reporting and version history are collapsed; issue reporting is last',()=>{
  assert.match(html,/<details class="game-settings-details">/);
  assert.match(html,/<details class="game-settings-details game-settings-report">/);
  assert.match(html,/<details id="onlineSettingsPrivacy" class="game-settings-details game-settings-privacy">/);
  assert.match(html,/<details class="version-history" data-version-history>/);
  assert.doesNotMatch(html,/<details[^>]*\bopen(?:=|>)/);
  assert.match(html,/href="\.\/privacy\.html"/);
  assert.match(page,/<footer class="lobby-footer">[\s\S]*?href="\.\/privacy\.html"/);
  const report=html.indexOf('id="onlineReportGameButton"');
  const status=html.indexOf('id="onlineReportGameStatus"');
  const save=html.indexOf('id="onlineSettingsSave"');
  const issue=html.indexOf('id="onlineReportProblemButton"');
  assert.ok(report>0&&status>report&&save>status&&issue>save);
  assert.match(html,/id="onlineReportGameStatus" class="dialog-note" role="status" aria-live="polite"/);
  assert.match(html,/id="onlineTimeHelp"[^>]*>Online partie mají pevně 60 sekund na tah a 3 sekundy/);
  assert.match(css,/#onlineGameSettingsDialog \.online-game-settings-body\{padding:16px 18px;gap:9px;text-align:left\}/);
  assert.match(page,/href="\.\/arena-home\.css\?v=[\w.-]+"/);
});

test('fixed online durations, sound and cancel/save actions remain available',()=>{
  assert.match(html,/id="onlineSoundSetting" checked/);
  for(const id of ['onlineSettingsCancel','onlineSettingsSave','onlineReportProblemButton'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  const client=file('../src/online-client.js');
  assert.match(client,/onlineSettingsSave'\)\.addEventListener\('click'/);
  assert.match(client,/onlineSettingsCancel'\)\.addEventListener\('click'/);
  assert.match(client,/buttonId:'onlineReportProblemButton'/);
  assert.match(client,/const ONLINE_TURN_SECONDS=60/);
  assert.match(client,/const ONLINE_RECAP_SECONDS=3/);
});
