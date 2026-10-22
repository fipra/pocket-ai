import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepareUsb} from '../preparer/copy.mjs';

const appName = process.platform === 'win32' ? 'USB AI.exe' : 'USB AI.app';

test('prepares an app and preserves an existing workspace', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'usb-ai-preparer-'));
  try {
    const source = path.join(root, 'source');
    const destination = path.join(root, 'usb');
    await fs.mkdir(source);
    await fs.mkdir(path.join(destination, 'PocketAI-data'), {recursive: true});
    await fs.writeFile(path.join(source, 'app.bin'), 'application');
    await fs.writeFile(path.join(destination, 'PocketAI-data', 'workspace.json'), '{"chats":[]}');
    const result = await prepareUsb(source, destination);
    assert.equal(result.target, path.join(destination, appName));
    assert.equal(await fs.readFile(path.join(result.target, 'app.bin'), 'utf8'), 'application');
    assert.equal(await fs.readFile(path.join(destination, 'PocketAI-data', 'workspace.json'), 'utf8'), '{"chats":[]}');
    await assert.rejects(prepareUsb(source, destination), /già presente/);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});

test('preserves app bundle symbolic links', {skip: process.platform === 'win32'}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'usb-ai-preparer-link-'));
  try {
    const source = path.join(root, 'source');
    const destination = path.join(root, 'usb');
    await fs.mkdir(source);
    await fs.mkdir(destination);
    await fs.writeFile(path.join(source, 'binary'), 'application');
    await fs.symlink('binary', path.join(source, 'current'));
    await prepareUsb(source, destination);
    assert.equal(await fs.readlink(path.join(destination, appName, 'current')), 'binary');
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});
