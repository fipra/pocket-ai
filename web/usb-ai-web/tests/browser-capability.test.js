import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafari, isFirefox, largeModelWarningBrowser, usesSafariCpu, modelOptions, needsSafariFallback, generationLimit, threadCount, isWindows, inferencePreferences } from '../browser-capability.js';

const safari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15';
const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0';

test('large model notice appears only in Safari and Firefox', () => {
  assert.equal(largeModelWarningBrowser(safari), 'safari');
  assert.equal(isFirefox(firefox), true);
  assert.equal(largeModelWarningBrowser(firefox), 'firefox');
  assert.equal(largeModelWarningBrowser(chrome), null);
});

test('Safari without WebGPU uses a smaller CPU context', () => {
  assert.equal(isSafari(safari), true);
  assert.equal(usesSafariCpu(safari, undefined), true);
  assert.deepEqual(modelOptions({ safariCpu: true }), { n_ctx: 2048, n_batch: 64, n_threads: 1, n_gpu_layers: 0, jinja: true, reasoning: true });
});
test('iPhone diagnostics request CPU, a single thread and 512 tokens', () => {
  assert.deepEqual(modelOptions({iosDiagnostic:true}), {n_ctx:512,n_batch:64,n_threads:1,n_gpu_layers:0,jinja:true,reasoning:true});
});

test('Chrome and Safari with WebGPU retain the standard context', () => {
  assert.equal(isSafari(chrome), false);
  assert.equal(usesSafariCpu(safari, {}), false);
  assert.equal(modelOptions({ safariCpu: false, deviceMemory: 8 }).n_ctx, 8192);
});

test('local context and output settings apply within supported choices', () => {
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8, contextSize:16384}).n_ctx, 16384);
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8, contextSize:999999}).n_ctx, 8192);
  assert.equal(modelOptions({safariCpu:true, contextSize:16384}).n_ctx, 2048);
  assert.equal(generationLimit(8192), 8192);
  assert.equal(generationLimit(999999), 3072);
  assert.equal(generationLimit(8192, {safariCpu:true}), 768);
});

test('optional CPU threads preserve the default and protect diagnostic modes', () => {
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8}).n_threads, 1);
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8, threads:4}).n_threads, 4);
  assert.equal(modelOptions({safariCpu:true, threads:4}).n_threads, 1);
  assert.equal(modelOptions({iosDiagnostic:true, threads:4}).n_threads, 1);
  assert.equal(threadCount('auto', 8), 4);
  assert.equal(threadCount('auto', 2), 1);
  assert.equal(threadCount(999, 8), 1);
});

test('backend choice is limited to Windows and leaves the default unchanged', () => {
  assert.equal(isWindows('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ''), true);
  assert.equal(isWindows('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 'macOS'), false);
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8, windows:true}).n_gpu_layers, undefined);
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8, windows:true, backend:'cpu'}).n_gpu_layers, 0);
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8, windows:true, backend:'gpu'}).n_gpu_layers, 99999);
  assert.equal(modelOptions({safariCpu:false, deviceMemory:8, windows:false, backend:'cpu'}).n_gpu_layers, undefined);
  assert.equal(modelOptions({iosDiagnostic:true, windows:true, backend:'gpu'}).n_gpu_layers, 0);
});

test('fresh Windows uses CPU and four threads while saved preferences are respected', () => {
  assert.deepEqual(inferencePreferences({}, true), {cpuThreads:'4', windowsBackend:'cpu'});
  assert.deepEqual(inferencePreferences({}, false), {cpuThreads:'1', windowsBackend:'auto'});
  assert.deepEqual(inferencePreferences({cpuThreads:'1', windowsBackend:'gpu'}, true), {cpuThreads:'1', windowsBackend:'gpu'});
  assert.deepEqual(inferencePreferences({cpuThreads:'2', windowsBackend:'auto'}, true), {cpuThreads:'2', windowsBackend:'auto'});
});

test('Safari CPU avoids automatic 3B loading while retaining small models', () => {
  assert.equal(needsSafariFallback({ size: 1_599_668_768 }, true), true);
  assert.equal(needsSafariFallback({ size: 491_400_032 }, true), false);
  assert.equal(needsSafariFallback({ size: 1_599_668_768 }, false), false);
});
