import test from 'node:test';
import assert from 'node:assert/strict';
import { validPhotoFiles } from '../photo-search.js';

test('photo selection accepts common local images and rejects unsupported or excessive input', () => {
  const image = {type:'image/jpeg',size:1024};
  assert.equal(validPhotoFiles([image, {type:'image/png',size:1024}]), true);
  assert.equal(validPhotoFiles([]), false);
  assert.equal(validPhotoFiles([{type:'image/svg+xml',size:100}]), false);
  assert.equal(validPhotoFiles([{type:'image/jpeg',size:20_000_001}]), false);
  assert.equal(validPhotoFiles(Array(21).fill(image)), false);
});
