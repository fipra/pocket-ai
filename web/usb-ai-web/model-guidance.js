import { estimateMemory } from './hub.js';
import { largeModelWarningBrowser } from './browser-capability.js';

export function browserHardware({ deviceMemory, hardwareConcurrency, userAgent } = navigator) {
  return {
    ramGb: Number.isFinite(deviceMemory) && deviceMemory > 0 ? deviceMemory : null,
    cores: Number.isInteger(hardwareConcurrency) && hardwareConcurrency > 0 ? hardwareConcurrency : null,
    limitedBrowser: largeModelWarningBrowser(userAgent)
  };
}

export function modelGuidance(model, hardware) {
  const size = Number(model.size) || 0;
  const memory = estimateMemory(size);
  if (hardware.limitedBrowser && size > 700_000_000) return { fit:'unsupported', reason:'modelBrowserLimit', memory };
  if (hardware.ramGb === null) return { fit:'unknown', reason:'modelRamUnknown', memory };
  if (hardware.ramGb < memory.minimum) return { fit:'low', reason:'modelRamLow', memory };
  if (hardware.cores !== null && hardware.cores <= 2 && size > 700_000_000) return { fit:'slow', reason:'modelCpuSlow', memory };
  if (hardware.ramGb < memory.recommended) return { fit:'possible', reason:'modelRamBorderline', memory };
  return { fit:'good', reason:'modelFits', memory };
}

export function recommendedModel(models, hardware) {
  const eligible = models.filter(model => modelGuidance(model, hardware).fit !== 'unsupported');
  const good = eligible.filter(model => modelGuidance(model, hardware).fit === 'good');
  if (good.length) return [...good].sort((a,b) => b.size - a.size)[0];
  const possible = eligible.filter(model => modelGuidance(model, hardware).fit === 'possible');
  if (possible.length) return [...possible].sort((a,b) => b.size - a.size)[0];
  if (hardware.ramGb === null) return eligible.find(model => model.id === 'llama-3.2-1b') || [...eligible].sort((a,b) => a.size - b.size)[0] || null;
  return [...eligible].sort((a,b) => a.size - b.size)[0] || null;
}
