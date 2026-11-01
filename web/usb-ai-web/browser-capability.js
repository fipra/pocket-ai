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

export function threadCount(value, hardwareConcurrency = globalThis.navigator?.hardwareConcurrency) {
  if (value === 'auto') return Math.max(1, Math.min(4, Math.floor((Number(hardwareConcurrency) || 2) / 2)));
  return [1, 2, 4].includes(Number(value)) ? Number(value) : 1;
}

export function isWindows(userAgent = globalThis.navigator?.userAgent || '', platform = globalThis.navigator?.userAgentData?.platform || '') {
  return /windows/i.test(platform) || /windows nt/i.test(userAgent);
}

export async function hasUsableWebGpu(gpu = globalThis.navigator?.gpu, timeoutMs = 3000) {
  if (!gpu || typeof gpu.requestAdapter !== 'function') return false;
  let timeout;
  try {
    const adapter = await Promise.race([
      gpu.requestAdapter(),
      new Promise(resolve => { timeout = setTimeout(() => resolve(null), timeoutMs); })
    ]);
    return !!adapter && adapter.isFallbackAdapter !== true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export function inferencePreferences(settings = {}, windows = isWindows(), webGpuAvailable = false) {
  const threads = String(settings?.cpuThreads);
  const backend = settings?.windowsBackend;
  return {
    cpuThreads: ['1', '2', '4', 'auto'].includes(threads) ? threads : windows ? '4' : '1',
    windowsBackend: ['auto', 'cpu', 'gpu'].includes(backend) ? backend : windows && !webGpuAvailable ? 'cpu' : 'auto'
  };
}

export function modelOptions({ safariCpu = usesSafariCpu(), deviceMemory = navigator.deviceMemory, iosDiagnostic = false, contextSize: requestedContext = 0, threads = 1, hardwareConcurrency = globalThis.navigator?.hardwareConcurrency, backend = 'auto', windows = isWindows() } = {}) {
  if (iosDiagnostic) return { n_ctx: 512, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: true };
  if (safariCpu) return { n_ctx: 2048, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: true };
  const contextSize = [4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576].includes(Number(requestedContext)) ? Number(requestedContext) : deviceMemory && deviceMemory <= 4 ? 4096 : 8192;
  const options = { n_ctx: contextSize, n_threads: threadCount(threads, hardwareConcurrency), jinja: true, reasoning: true };
  if (windows && backend === 'cpu') options.n_gpu_layers = 0;
  if (windows && backend === 'gpu') options.n_gpu_layers = 99999;
  return options;
}

export function needsSafariFallback(model, safariCpu = usesSafariCpu()) {
  return safariCpu && Number(model?.size) > 700_000_000;
}

export function generationLimit(value, { iosDiagnostic = false, safariCpu = false } = {}) {
  if (iosDiagnostic) return 128;
  if (safariCpu) return 768;
  return [1024, 3072, 4096, 8192, 16384].includes(Number(value)) ? Number(value) : 3072;
}
