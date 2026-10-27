import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const page=file('../index.html');
const css=file('../arena-home.css');
const start=page.indexOf('<dialog id="onlineGameSettingsDialog"');
const end=page.indexOf('</dialog>',start);
const html=page.slice(start,end);

test('both panel toggles and both time selects are compact side-by-side groups',()=>{
  assert.ok(start>=0&&end>start);
  assert.match(html,/<div class="settings-toggle-grid" role="group" aria-label="Zobrazení panelů">/);
  assert.match(html,/<div class="settings-select-grid">/);
  for(const id of ['onlineHistorySetting','onlineChatSetting','onlineRecapSeconds','onlineTurnSeconds']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' must remain present once');
  }
  assert.match(css,/#onlineGameSettingsDialog \.settings-toggle-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/#onlineGameSettingsDialog \.settings-select-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/#onlineGameSettingsDialog \.settings-field select\{[^}]*min-width:0/);
});

test('help, game reporting and version history are collapsed; issue reporting is last',()=>{
  assert.match(html,/<details class="settings-help-details">/);
  assert.match(html,/<details class="settings-report-details">/);
  assert.match(html,/<details class="version-history" data-version-history>/);
  assert.doesNotMatch(html,/<details[^>]*\bopen(?:=|>)/);
  assert.doesNotMatch(html,/href="\.\/privacy\.html"/);
  assert.match(page,/<footer class="lobby-footer">[\s\S]*?href="\.\/privacy\.html"/);
  const report=html.indexOf('id="onlineReportGameButton"');
  const status=html.indexOf('id="onlineReportGameStatus"');
  const save=html.indexOf('id="onlineSettingsSave"');
  const issue=html.indexOf('id="onlineReportProblemButton"');
  assert.ok(report>0&&status>report&&save>status&&issue>save);
  assert.match(html,/id="onlineReportGameStatus" role="status" aria-live="polite"/);
  assert.match(html,/id="onlineTimeHelp"/);
  assert.match(html,/aria-describedby="onlineTimeHelp"/);
  assert.match(css,/#onlineGameSettingsDialog \.online-game-settings-body\{padding:16px 18px;gap:9px;text-align:left\}/);
  assert.match(page,/href="\.\/arena-home\.css\?v=0\.2\.11"/);
});

test('original time values, cancel and save actions remain available',()=>{
  for(const [id,values] of [['onlineRecapSeconds',[0,2,3,5,8,10]],['onlineTurnSeconds',[30,60,90]]]){
    const select=html.slice(html.indexOf('id="'+id+'"'),html.indexOf('</select>',html.indexOf('id="'+id+'"')));
    for(const value of values)assert.match(select,new RegExp('<option value="'+value+'"'));
  }
  for(const id of ['onlineSettingsCancel','onlineSettingsSave','onlineReportProblemButton'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
  const client=file('../src/online-client.js');
  assert.match(client,/onlineSettingsSave'\)\.addEventListener\('click'/);
  assert.match(client,/onlineSettingsCancel'\)\.addEventListener\('click'/);
  assert.match(client,/buttonId:'onlineReportProblemButton'/);
});
