import { documentQuestion, recentContext } from './retrieval.js';

export function ragContexts(history, question, sources) {
  if (!sources.length) return [recentContext(history, question)];
  return [
    recentContext(history, documentQuestion(question, sources, 1300), 700),
    [{ role:'user', content:documentQuestion(question, sources.slice(0,1), 500) }]
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
