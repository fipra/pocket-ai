// Built-in starter model. Hash and size match the desktop catalog.
export const CATALOG = [{
  id: 'llama-3.2-1b', name: 'Llama 3.2 · 1B Q4 — Built with Llama', size: 807694464,
  url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/9971ce1bbba2f8b55de026a783323a808b3eeedb/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  source: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/blob/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
  sha256: '6f85a640a97cf2bf5b8e764087b1e83da0fdb51d7c9fab7d0fece9385611df83',
  license: 'Llama 3.2 Community License'
}];

// Available only inside the opt-in iPhone diagnostic flow.
export const IOS_DIAGNOSTIC_MODEL = {
  id:'ios-diagnostic-smollm2-135m', name:'SmolLM2 · 135M Q4 — iPhone test', size:105454144,
  url:'https://huggingface.co/QuantFactory/SmolLM2-135M-Instruct-GGUF/resolve/476854d00ede130660aba430d15f9347ad2e7d0e/SmolLM2-135M-Instruct.Q4_K_M.gguf',
  source:'https://huggingface.co/QuantFactory/SmolLM2-135M-Instruct-GGUF/blob/476854d00ede130660aba430d15f9347ad2e7d0e/SmolLM2-135M-Instruct.Q4_K_M.gguf',
  sha256:'8030f04528538d47bda434f6f0bdf3952c40a58123e4d5e755332f23731a8684',
  license:'Apache-2.0', mobile:true
};
export function starterModelForMode(iosDiagnostic = false) {
  return iosDiagnostic ? IOS_DIAGNOSTIC_MODEL : CATALOG[0];
}
