#!/usr/bin/env python3
"""Build an isolated experimental Prism WebGPU app from pinned runtime assets."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
web = root / 'web'
dest = root / '.vercel-static' / 'prism-gpu'

def replace_file(path, old, new):
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f'Expected text not found in {path.name}')
    path.write_text(text.replace(old, new, 1))

with tempfile.TemporaryDirectory(prefix='llamanest-prism-gpu-') as tmp:
    work = Path(tmp) / 'web'
    shutil.copytree(web, work, ignore=shutil.ignore_patterns('node_modules', 'dist'))
    (work / 'node_modules').symlink_to(web / 'node_modules', target_is_directory=True)
    app = work / 'usb-ai-web'
    with zipfile.ZipFile(root / 'scripts' / 'prism-webgpu-runtime.zip') as archive:
        for name in ('prism-webgpu.js', 'prism-wllama.js', 'prism-webgpu.wasm'):
            (app / name).write_bytes(archive.read(name))
    runtime = app / 'runtime.js'
    replace_file(runtime, "import('@wllama/wllama').then(({ ModelManager })", "import('./prism-wllama.js').then(({ ModelManager })")
    replace_file(runtime, "import('@wllama/wllama'),\n    import('@wllama/wllama-compat/wasm/wllama.js?raw')", "import('./prism-wllama.js'),\n    import('./prism-webgpu.js?raw')")
    replace_file(runtime, 'new Wllama(paths, { logger, allowOffline: true })', 'new Wllama(paths, { logger, allowOffline: true, prismWorkerCode: compatWorker })')
    replace_file(runtime, "runtime.setCompat({ wasm: `${import.meta.env.BASE_URL}wasm/wllama-compat.wasm`, worker: { code: compatWorker } });", 'runtime.setCompat(null);')
    replace_file(runtime, '  const options = modelOptions({iosDiagnostic:diagnostic, contextSize, threads, backend});', "  if (!navigator.gpu || typeof WebAssembly.Suspending !== 'function') throw Error('WebGPU and Chrome JSPI are required');\n  const options = modelOptions({iosDiagnostic:diagnostic, contextSize, threads, backend});\n  options.n_gpu_layers = 99999;\n  options.n_batch = 64;\n  options.n_ubatch = 64;\n  options.warmup = false;")
    replace_file(runtime, '    const metadata = next.getModelMetadata();', "    if (detector.value().kind !== 'gpu') throw Error('The model could not be loaded on WebGPU');\n    const metadata = next.getModelMetadata();")
    replace_file(app / 'hub.js', 'export const WEB_FILE_LIMIT = 2_000_000_000;', 'export const WEB_FILE_LIMIT = 3_000_000_000;')
    replace_file(app / 'storage.js', "const DB = 'usb-ai-web-v1'", "const DB = 'usb-ai-web-prism-gpu-experimental-v1'")
    replace_file(app / 'main.js', 'llamanest-remote-panel-open', 'llamanest-prism-gpu-remote-panel-open')
    replace_file(app / 'folder-models.js', 'usb-ai-models', 'usb-ai-prism-gpu-models')
    replace_file(app / 'public' / 'sw.js', 'usb-ai-web-shell-', 'usb-ai-prism-gpu-shell-')
    config = app / 'vite.config.js'
    old = "resolve(import.meta.dirname, '..', 'node_modules', '@wllama', 'wllama', 'esm', 'wasm', 'wllama.wasm')"
    replace_file(config, old, "resolve(import.meta.dirname, 'prism-webgpu.wasm')")
    replace_file(config, "copyFileSync(resolve(base, 'wllama.wasm'), resolve(dest, 'wllama.wasm'));", "copyFileSync(resolve(import.meta.dirname, 'prism-webgpu.wasm'), resolve(dest, 'wllama.wasm'));")
    html = app / 'index.html'
    banner = '''<div id="prism-gpu-notice" style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">Experimental Prism WebGPU: GPU for model layers; some operations run on CPU. Chrome on Apple Silicon tested; performance varies. Separate browser data.</div><script>const m={it:'Prism WebGPU sperimentale: livelli del modello sulla GPU; alcune operazioni usano la CPU. Provato con Chrome su Apple Silicon; velocità variabile. Dati del browser separati.',fr:'Prism WebGPU expérimental : couches du modèle sur GPU ; certaines opérations utilisent le processeur. Testé avec Chrome sur Apple Silicon ; vitesse variable. Données séparées.',de:'Prism WebGPU experimentell: Modellebenen auf der GPU; einige Vorgänge nutzen die CPU. Mit Chrome auf Apple Silicon getestet; Geschwindigkeit variiert. Separate Browserdaten.',es:'Prism WebGPU experimental: capas del modelo en GPU; algunas operaciones usan la CPU. Probado con Chrome en Apple Silicon; velocidad variable. Datos separados.'};document.getElementById('prism-gpu-notice').textContent=m[(navigator.language||'en').slice(0,2)]||document.getElementById('prism-gpu-notice').textContent;</script>'''
    replace_file(html, '<body>', '<body>' + banner)
    env = dict(os.environ, USB_AI_WEB_BASE='/prism-gpu/')
    subprocess.run(['npm', 'run', 'build'], cwd=work, env=env, check=True)
    shutil.copytree(work / 'dist', dest, dirs_exist_ok=True)
