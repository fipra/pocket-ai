import test from 'node:test';
import assert from 'node:assert/strict';
import { browserHardware, modelGuidance, recommendedModel } from '../model-guidance.js';

const models = [{id:'small',size:105_000_000},{id:'qwen-0.5b',size:491_000_000},{id:'llama',size:1_600_000_000}];
const chrome = 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36';
const safari = 'Mozilla/5.0 Version/18.6 Safari/605.1.15';

test('browser hardware treats unavailable RAM as unknown', () => {
  const hardware = browserHardware({hardwareConcurrency:8,userAgent:chrome});
  assert.equal(hardware.ramGb, null);
  assert.equal(modelGuidance(models[2], hardware).fit, 'unknown');
  assert.equal(recommendedModel(models, hardware).id, 'small');
  assert.equal(recommendedModel([...models, {id:'llama-3.2-1b',size:807_694_464}], hardware).id, 'llama-3.2-1b');
});

test('RAM and core estimates guide the browser model choice', () => {
  const strong = browserHardware({deviceMemory:8,hardwareConcurrency:8,userAgent:chrome});
  assert.equal(recommendedModel(models, strong).id, 'llama');
  const weak = browserHardware({deviceMemory:4,hardwareConcurrency:2,userAgent:chrome});
  assert.equal(modelGuidance(models[2], weak).fit, 'slow');
  assert.equal(recommendedModel(models, weak).id, 'qwen-0.5b');
});

test('Safari and Firefox do not recommend unsupported large web models', () => {
  const hardware = browserHardware({deviceMemory:8,hardwareConcurrency:8,userAgent:safari});
  assert.equal(modelGuidance(models[2], hardware).fit, 'unsupported');
  assert.equal(recommendedModel(models, hardware).id, 'qwen-0.5b');
});
