import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../../../landing-mobile-gate.js', import.meta.url), 'utf8');

test('phone download and Web links show the short alert without navigating', () => {
  const handlers = [];
  const links = Array.from({ length: 4 }, () => ({ addEventListener: (_event, handler) => handlers.push(handler) }));
  const note = { lastChild: { textContent: '' } };
  const alerts = [];
  const document = {
    documentElement: { lang: 'it' },
    querySelector: () => note,
    querySelectorAll: () => links
  };
  runInNewContext(script, {
    document,
    navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)' },
    window: { alert: message => alerts.push(message) }
  });
  assert.equal(note.lastChild.textContent, 'Solo per PC e Mac');
  assert.equal(handlers.length, links.length);
  let prevented = false;
  handlers[0]({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(alerts[0], 'Offllama non è per smartphone al momento, ma ci stiamo lavorando.');
});
