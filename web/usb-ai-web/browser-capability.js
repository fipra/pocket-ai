export function isSafari(userAgent = navigator.userAgent) {
  return /Version\/[\d.]+.*Safari\//.test(userAgent) && !/(?:Chrome|Chromium|CriOS|Edg|OPR)\//.test(userAgent);
}

export function isFirefox(userAgent = navigator.userAgent) {
  return /(?:Firefox|FxiOS)\/[\d.]+/.test(userAgent);
}

export function largeModelWarningBrowser(userAgent = navigator.userAgent) {
  if (isSafari(userAgent)) return 'safari';
  if (isFirefox(userAgent)) return 'firefox';
  return null;
}

export function usesSafariCpu(userAgent = navigator.userAgent, gpu = navigator.gpu) {
  return isSafari(userAgent) && !gpu;
}

export function modelOptions({ safariCpu = usesSafariCpu(), deviceMemory = navigator.deviceMemory, iosDiagnostic = false, contextSize: requestedContext = 0 } = {}) {
  if (iosDiagnostic) return { n_ctx: 512, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: true };
  if (safariCpu) return { n_ctx: 2048, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: true };
  const contextSize = [4096, 8192, 16384, 32768].includes(Number(requestedContext)) ? Number(requestedContext) : deviceMemory && deviceMemory <= 4 ? 4096 : 8192;
  return { n_ctx: contextSize, n_threads: 1, jinja: true, reasoning: true };
}

export function needsSafariFallback(model, safariCpu = usesSafariCpu()) {
  return safariCpu && Number(model?.size) > 700_000_000;
}

export function generationLimit(value, { iosDiagnostic = false, safariCpu = false } = {}) {
  if (iosDiagnostic) return 128;
  if (safariCpu) return 768;
  return [1024, 3072, 4096, 8192, 16384].includes(Number(value)) ? Number(value) : 3072;
}
