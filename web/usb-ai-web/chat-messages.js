// Strict chat templates only accept one system message, at index zero.
export function normalizeChatMessages(messages) {
  const instructions = messages.filter(message => message.role === 'system');
  const conversation = messages.filter(message => message.role !== 'system');
  if (!instructions.length) return conversation;
  return [{ role: 'system', content: instructions.map(message => message.content).join('\n\n') }, ...conversation];
}
