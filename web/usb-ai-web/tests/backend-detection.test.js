import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendDetector } from '../backend-detection.js';

test('reports GPU only when the runtime confirms offloaded layers', () => {
  const detector = createBackendDetector();
  detector.record('WebGPU available', 'CPU model buffer size = 2 MiB');
  assert.equal(detector.value().kind, 'unknown');
  detector.record('load_tensors: offloaded 3/5 layers to GPU');
  assert.deepEqual(detector.value(), {kind:'gpu', layers:3, total:5});
});

test('reports CPU after a confirmed unavailable adapter or zero offloaded layers', () => {
  const noAdapter = createBackendDetector();
  noAdapter.record('requestAdapter returned null');
  assert.equal(noAdapter.value().kind, 'unknown');
  noAdapter.record('load_tensors: CPU model buffer size = 4 MiB');
  assert.equal(noAdapter.value().kind, 'cpu');
  const noOffload = createBackendDetector();
  noOffload.record('offloaded 0/3 layers to GPU');
  assert.deepEqual(noOffload.value(), {kind:'cpu',layers:0,total:3});
});
