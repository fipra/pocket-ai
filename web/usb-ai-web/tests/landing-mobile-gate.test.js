import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../../landing-mobile-gate.js', import.meta.url), 'utf8');
function run(userAgent) {
  const web = {href:'/app/', handlers:[], addEventListener(_event, cb){this.handlers.push(cb)}};
  const download = {href:'#download', handlers:[], addEventListener(_event, cb){this.handlers.push(cb)}};
  const note = {lastChild:{textContent:''}};
  const alerts = [];
  const document = {documentElement:{lang:'it'}, querySelector:()=>note,
    querySelectorAll:selector => selector === 'a[href="/app/"]' ? [web] : selector.includes('a[href="/app/"]') ? [web,download] : [download]};
  runInNewContext(script,{document,navigator:{userAgent},window:{alert:message=>alerts.push(message)}});
  return {web,download,note,alerts};
}
test('iPhone Web link opens experimental diagnostics, while desktop download remains blocked', () => {
  const {web,download,note,alerts}=run('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)');
  assert.equal(web.href,'/app/?iosdiag=1');assert.equal(web.handlers.length,0);
  assert.equal(note.lastChild.textContent,'Web su iPhone: prova sperimentale');
  let prevented=false;download.handlers[0]({preventDefault:()=>{prevented=true}});
  assert.equal(prevented,true);assert.equal(alerts.length,1);
});
test('Android continues to block the web link', () => {
  const {web}=run('Mozilla/5.0 (Linux; Android 16; Pixel 10) Mobile');
  assert.equal(web.handlers.length,1);
});
