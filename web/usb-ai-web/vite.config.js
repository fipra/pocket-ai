import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

const basePath = process.env.USB_AI_WEB_BASE || '/';
export default defineConfig({
  base: basePath,
  root: resolve(import.meta.dirname),
  publicDir: resolve(import.meta.dirname, 'public'),
  build: { outDir: resolve(import.meta.dirname, '..', 'dist'), emptyOutDir: true },
  plugins: [{ name: 'copy-wllama-wasm-and-precache', configureServer(server) {
    server.middlewares.use('/wasm/wllama.wasm', (request, response, next) => {
      try {
        const wasm = resolve(import.meta.dirname, '..', 'node_modules', '@wllama', 'wllama', 'esm', 'wasm', 'wllama.wasm');
        response.setHeader('Content-Type', 'application/wasm');
        response.end(readFileSync(wasm));
      } catch (error) { next(error); }
    });
  }, closeBundle() {
    const base = resolve(import.meta.dirname, '..', 'node_modules', '@wllama', 'wllama', 'esm', 'wasm');
    const dest = resolve(import.meta.dirname, '..', 'dist', 'wasm');
    mkdirSync(dest, { recursive: true });
    copyFileSync(resolve(base, 'wllama.wasm'), resolve(dest, 'wllama.wasm'));
    const dist = resolve(import.meta.dirname, '..', 'dist');
    const assets = readdirSync(resolve(dist, 'assets')).map(name => `${basePath}assets/${name}`);
    const worker = resolve(dist, 'sw.js');
    writeFileSync(worker, readFileSync(worker, 'utf8').replace('__PRECACHE__', JSON.stringify(assets)).replaceAll('__BASE__', basePath));
    const manifest = resolve(dist, 'manifest.webmanifest');
    const data = JSON.parse(readFileSync(manifest, 'utf8'));
    data.start_url = basePath;
    data.scope = basePath;
    data.icons = data.icons.map(icon => ({ ...icon, src: `${basePath}icon.svg` }));
    writeFileSync(manifest, JSON.stringify(data));
  } }],
});
