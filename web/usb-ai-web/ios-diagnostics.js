import { isIPhone } from './phone-gate.js';

export const iosDiagnosticsEnabled = (userAgent = navigator.userAgent, search = location.search) =>
  isIPhone(userAgent) && new URLSearchParams(search).get('iosdiag') === '1';

const events = [];
export function iosDiagnostic(event, detail = '') {
  if (!iosDiagnosticsEnabled()) return;
  const line = `${new Date().toLocaleTimeString()} · ${event}${detail ? ` · ${detail}` : ''}`;
  events.push(line);
  if (events.length > 100) events.shift();
  const output = document.getElementById('ios-diagnostic-output');
  if (output) output.textContent = events.join('\n');
  console.info('[LlamaNest iOS]', line);
}
