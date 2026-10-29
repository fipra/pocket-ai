// Native llama.cpp load logs report model layers actually placed on the GPU.
// Availability of navigator.gpu alone is not evidence that inference uses it.
export function createBackendDetector({ forceCpu = false } = {}) {
  let result = { kind: 'unknown' };
  let gpuUnavailable = false;
  let cpuModel = false;
  let buffer = '';
  return {
    record(...args) {
      buffer = (buffer + '\n' + args.map(String).join(' ')).slice(-16000);
      const matches = [...buffer.matchAll(/offloaded\s+(\d+)\s*\/\s*(\d+)\s+layers\s+to\s+GPU/gi)];
      if (matches.length) {
        const match = matches[matches.length - 1];
        const layers = Number(match[1]), total = Number(match[2]);
        if (total > 0 && layers <= total) result = { kind: layers > 0 ? 'gpu' : 'cpu', layers, total };
      }
      if (/failed to get an adapter|webgpu (?:is )?(?:disabled|not available)|requestAdapter returned null/i.test(buffer)) gpuUnavailable = true;
      if (/CPU(?:_Mapped)?\s+model buffer size/i.test(buffer)) cpuModel = true;
      if (result.kind === 'unknown' && cpuModel && (forceCpu || gpuUnavailable)) result = { kind: 'cpu' };
    },
    value() { return { ...result }; }
  };
}
