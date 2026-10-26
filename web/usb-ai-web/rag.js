import { documentQuestion, recentContext } from './retrieval.js';

const FORMAT_GUIDE = { role:'system', content:'For longer answers, use short Markdown paragraphs, headings or lists when helpful. Put code in fenced blocks. Keep brief answers brief.' };

export function appQuestion(question) {
  const asksToBuild = /\b(crea|creare|costruisci|sviluppa|scrivi|create|build|make|develop|write|erstelle|baue|crée|construis|crea|haz)\b/i.test(question);
  const asksForApp = /\b(app|applicazione|application|website|sito|webpage|pagina web|html|javascript)\b/i.test(question);
  if (!asksToBuild || !asksForApp) return question;
  return `${question}\n\nProvide a complete runnable browser app. Prefer one fenced html block with CSS and JavaScript inline. If you use separate files, include every referenced file as a complete fenced html, css, or javascript block. Ensure event handlers target existing elements and forms do not reload the page. Do not leave placeholders or omit closing code fences.`;
}

export function ragContexts(history, question, sources) {
  question = appQuestion(question);
  if (!sources.length) return [[FORMAT_GUIDE, ...recentContext(history, question)]];
  return [
    [FORMAT_GUIDE, ...recentContext(history, documentQuestion(question, sources, 1300), 700)],
    [FORMAT_GUIDE, { role:'user', content:documentQuestion(question, sources.slice(0,1), 500) }]
  ];
}

export async function completeWithRetry(contexts, stream, onToken, signal, onRetry = () => {}) {
  let lastError;
  for (let i = 0; i < contexts.length; i++) {
    if (signal.aborted) return;
    let visible = '';
    try {
      await stream(contexts[i], token => {
        visible += token;
        onToken(token);
      }, signal);
      if (visible.trim()) return;
    } catch (error) {
      if (signal.aborted) return;
      lastError = error;
      if (visible.trim() || i === contexts.length - 1) throw error;
    }
    if (i < contexts.length - 1) onRetry();
  }
  throw lastError || Error('EMPTY_MODEL_RESPONSE');
}
