import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

// package.json is the sole input for cache-busting tokens in HTML and modules.
const root=resolve(import.meta.dirname,'..');
const {version}=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
const check=process.argv.includes('--check');
const files=readdirSync(root).filter(name=>name.endsWith('.html')).map(name=>join(root,name));
files.push(...readdirSync(join(root,'src')).filter(name=>name.endsWith('.js'))
  .map(name=>join(root,'src',name)));
let outdated=0;
for(const file of files){
  const source=readFileSync(file,'utf8');
  const updated=source.replace(/\?v=[\w.-]+/g,'?v='+version);
  if(source===updated)continue;
  outdated++;
  if(!check)writeFileSync(file,updated);
}
const versionFile=join(root,'src','version-data.js');
const current=readFileSync(versionFile,'utf8');
const expected=current.replace(/(export const APP_VERSION = ')[^']+(')/,"$1"+version+"$2");
if(expected!==current){
  outdated++;
  if(!check)writeFileSync(versionFile,expected);
}
if(check&&outdated){
  console.error('Neaktuální cache verze v '+outdated+' souborech. Spusť npm run stamp:assets.');
  process.exitCode=1;
}else console.log(check?'Cache verze odpovídají '+version:'Cache verze nastaveny na '+version+'.');
