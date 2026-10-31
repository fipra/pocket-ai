#!/usr/bin/env python3
"""Build the isolated, CPU-only experimental Prism browser app."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
web = root / 'web'
dest = root / '.vercel-static' / 'prism-web'
with tempfile.TemporaryDirectory(prefix='llamanest-prism-web-') as tmp:
    work = Path(tmp) / 'web'
    shutil.copytree(web, work, ignore=shutil.ignore_patterns('node_modules', 'dist'))
    (work / 'node_modules').symlink_to(web / 'node_modules', target_is_directory=True)
    app = work / 'usb-ai-web'
    with zipfile.ZipFile(root / 'scripts' / 'prism-web-runtime.zip') as archive:
        for name in ('prism-compat.js', 'prism-wllama.js', 'prism.wasm'):
            (app / name).write_bytes(archive.read(name))
    runtime = app / 'runtime.js'
    text = runtime.read_text()
    text = text.replace("import('@wllama/wllama').then(({ ModelManager })", "import('./prism-wllama.js').then(({ ModelManager })")
    old = "import('@wllama/wllama'),\n    import('@wllama/wllama-compat/wasm/wllama.js?raw')"
    assert old in text
    runtime.write_text(text.replace(old, "import('./prism-wllama.js'),\n    import('./prism-compat.js?raw')"))
    storage = app / 'storage.js'
    text = storage.read_text()
    assert "const DB = 'usb-ai-web-v1'" in text
    storage.write_text(text.replace("const DB = 'usb-ai-web-v1'", "const DB = 'usb-ai-web-prism-experimental-v1'"))
    main = app / 'main.js'
    main.write_text(main.read_text().replace('llamanest-remote-panel-open', 'llamanest-prism-remote-panel-open'))
    folders = app / 'folder-models.js'
    folders.write_text(folders.read_text().replace('usb-ai-models', 'usb-ai-prism-models'))
    worker = app / 'public' / 'sw.js'
    worker.write_text(worker.read_text().replace('usb-ai-web-shell-', 'usb-ai-prism-shell-'))
    config = app / 'vite.config.js'
    text = config.read_text()
    old = "resolve(import.meta.dirname, '..', 'node_modules', '@wllama', 'wllama-compat', 'wasm', 'wllama.wasm')"
    assert old in text
    config.write_text(text.replace(old, "resolve(import.meta.dirname, 'prism.wasm')"))
    html = app / 'index.html'
    text = html.read_text()
    assert '<body>' in text
    html.write_text(text.replace('<body>', '<body><div style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">PrismML Web experimental · CPU only · separate browser data</div>', 1))
    env = dict(os.environ, USB_AI_WEB_BASE='/prism-web/')
    subprocess.run(['npm', 'run', 'build'], cwd=work, env=env, check=True)
    shutil.copytree(work / 'dist', dest, dirs_exist_ok=True)
