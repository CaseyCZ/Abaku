import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('both local and online settings center their titles, controls and collapsed summaries',()=>{
  const css=read('../shared-game-settings.css');
  assert.match(css,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.game-settings-body h2 \{[^}]*text-align:center/s);
  assert.match(css,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.game-settings-section h3 \{[^}]*text-align:center/s);
  assert.match(css,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.game-settings-toggles \.check-line \{[^}]*justify-content:center!important/s);
  assert.match(css,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.game-settings-details summary \{[^}]*text-align:center/s);
  assert.match(css,/:is\(#settingsDialog,#onlineGameSettingsDialog\) \.version-history summary \{[^}]*text-align:center/s);
});

test('both feedback forms use short labels and initially tick both checkboxes',()=>{
  for(const path of ['../index.html','../game.html']){
    const page=read(path);
    assert.match(page,/id="feedbackAttach" checked> <span>Přiložit historii partie<\/span>/);
    assert.match(page,/id="feedbackConsent" checked required> <span>Souhlasím se zveřejněním<\/span>/);
    assert.match(page,/id="feedbackDescription"[\s\S]*?id="feedbackSubmit"/);
    assert.match(page,/Popis problému i případná historie partie se veřejně zobrazí na GitHubu/);
  }
  const code=read('../src/feedback-client.js');
  assert.match(code,/if\(attach\)attach\.checked=true/);
  assert.match(code,/if\(consent\)consent\.checked=true/);
  const css=read('../arena-modern.css');
  assert.match(css,/#feedbackDialog \.feedback-form h2,[\s\S]*?text-align:center/);
  assert.match(css,/#feedbackDialog \.feedback-form \.feedback-check-line\{[\s\S]*?justify-content:center!important/);
  assert.match(css,/#feedbackDialog \.feedback-form \.dialog-actions,[\s\S]*?justify-content:center/);
});
