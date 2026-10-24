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

export function modelOptions({ safariCpu = usesSafariCpu(), deviceMemory = navigator.deviceMemory } = {}) {
  if (safariCpu) return { n_ctx: 2048, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: false };
  const contextSize = deviceMemory && deviceMemory <= 4 ? 4096 : 8192;
  return { n_ctx: contextSize, n_threads: 1, jinja: true, reasoning: false };
}

export function needsSafariFallback(model, safariCpu = usesSafariCpu()) {
  return safariCpu && Number(model?.size) > 700_000_000;
}
