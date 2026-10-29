// Model Creator uses one UTF-8 byte per token and, in Q&A mode, two markers.
export function creatorRequest(messages, mode, context, limit) {
  const latest = [...messages].reverse().find(message => message.role === 'user');
  if (!latest || typeof latest.content !== 'string') throw Error('Enter a text prompt for this Model Creator model.');
  const used = new TextEncoder().encode(latest.content).length + (mode === 'qa' ? 2 : 0);
  const maxTokens = Math.min(limit, context - used);
  if (maxTokens < 1) throw Error('CREATOR_PROMPT_TOO_LONG');
  return { messages: [latest], maxTokens };
}
