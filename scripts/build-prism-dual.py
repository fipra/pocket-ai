#!/usr/bin/env python3
"""Build the experimental Prism Web app with selectable PrismML and standard engines."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
web = root / 'web'
base_path = os.environ.get('LLAMA_PRISM_DUAL_BASE', '/prism-dual/')
if base_path not in ('/prism-dual/', '/prism-gpu/', '/prism-fast/'):
    raise RuntimeError('Unsupported dual-engine base path')
dest = root / '.vercel-static' / base_path.strip('/')

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
    runtime_archive = 'prism-webgpu-fast-runtime.zip' if base_path == '/prism-fast/' else 'prism-webgpu-runtime.zip'
    with zipfile.ZipFile(root / 'scripts' / runtime_archive) as archive:
        for name in ('prism-webgpu.js', 'prism-wllama.js', 'prism-webgpu.wasm'):
            (app / name).write_bytes(archive.read(name))
    runtime = app / 'runtime.js'
    replace_file(runtime, 'wasm/wllama.wasm', 'wasm/standard-wllama.wasm')
    replace_file(runtime, "let engine;", "let engineMode = 'prism';\nexport function setEngineMode(value) { if (!['prism','standard'].includes(value)) throw Error('Invalid engine'); engineMode = value; }\nlet engine;")
    replace_file(runtime, "import('@wllama/wllama').then(({ ModelManager })", "import('./prism-wllama.js').then(({ ModelManager })")
    replace_file(runtime, "    import('@wllama/wllama'),\n    import('@wllama/wllama-compat/wasm/wllama.js?raw')", "    ...(engineMode === 'prism' ? [import('./prism-wllama.js'), import('./prism-webgpu.js?raw')] : [import('@wllama/wllama'), import('@wllama/wllama-compat/wasm/wllama.js?raw')])")
    replace_file(runtime, "  const runtime = new Wllama(paths, { logger, allowOffline: true });\n  runtime.setCompat({ wasm: `${import.meta.env.BASE_URL}wasm/wllama-compat.wasm`, worker: { code: compatWorker } });", "  const runtime = engineMode === 'prism' ? new Wllama({default:`${import.meta.env.BASE_URL}wasm/prism-webgpu.wasm`}, { logger, allowOffline:true, prismWorkerCode:compatWorker }) : new Wllama(paths, { logger, allowOffline:true });\n  runtime.setCompat(engineMode === 'prism' ? null : { wasm: `${import.meta.env.BASE_URL}wasm/wllama-compat.wasm`, worker: { code: compatWorker } });")
    replace_file(runtime, '  const options = modelOptions({iosDiagnostic:diagnostic, contextSize, threads, backend});', "  if (engineMode === 'prism' && (!navigator.gpu || typeof WebAssembly.Suspending !== 'function')) throw Error('WebGPU and Chrome JSPI are required for PrismML');\n  const options = modelOptions({iosDiagnostic:diagnostic, contextSize, threads, backend});\n  if (engineMode === 'prism') { options.n_gpu_layers = 99999; options.n_batch = 64; options.n_ubatch = 64; options.warmup = false; }")
    replace_file(runtime, '      return next.loadModel(cached, options);', '      return next.loadModel(await cached.open(), options);')
    replace_file(runtime, '    const metadata = next.getModelMetadata();', "    if (engineMode === 'prism' && detector.value().kind !== 'gpu') throw Error('The model could not be loaded on WebGPU');\n    const metadata = next.getModelMetadata();")
    main = app / 'main.js'
    replace_file(main, 'loadModel, unload, loadedModelId', 'loadModel, unload, setEngineMode, loadedModelId')
    replace_file(main, 'let contextSize = 0, outputLimit = 0, cpuThreads', "let webEngine = 'prism';\nlet contextSize = 0, outputLimit = 0, cpuThreads")
    replace_file(main, 'remoteConfig, contextSize, outputLimit, temperature, cpuThreads,', 'remoteConfig, contextSize, outputLimit, temperature, webEngine, cpuThreads,')
    replace_file(main, "const settings = await db.get('settings','main');", "const settings = await db.get('settings','main'); webEngine = settings?.webEngine === 'standard' ? 'standard' : 'prism'; setEngineMode(webEngine); $('web-engine').value = webEngine;")
    replace_file(main, "$('generation-temperature').onchange =", "$('web-engine').onchange = () => run(async () => { if (busy) { $('web-engine').value=webEngine; return; } const value=$('web-engine').value; setBusy(true); try { await unload(); setEngineMode(value); webEngine=value; await saveSettings(); setStatus(tr('engineChanged')); render(); } finally { setBusy(false); } });\n$('generation-temperature').onchange =")
    replace_file(main, 'function renderModels() {\n', 'function renderModels() {\n  renderBonsaiRecommendation();\n')
    recommendation = (root / 'scripts' / 'prism-recommendation.js').read_text()
    replace_file(main, 'setupRemoteUi();\ninit();', recommendation + "\nsetupRemoteUi();\ninit().then(() => { if (new URLSearchParams(location.search).get('recommended') === 'bonsai') { renderModels(); if (!$('models-dialog').open) $('models-dialog').showModal(); } });")
    translations = app / 'i18n.js'
    with translations.open('a') as out:
        out.write("\nconst webEngineStrings={en:{webEngine:'Model engine',enginePrism:'PrismML (WebGPU)',engineStandard:'Standard llama.cpp',engineChanged:'Engine changed. The model will reload on the next message.',engineHelp:'Choose the engine for compatible models. PrismML requires WebGPU and Chrome JSPI; changing engines reloads the model.'},it:{webEngine:'Motore del modello',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp standard',engineChanged:'Motore cambiato. Il modello si ricarica al prossimo messaggio.',engineHelp:'Scegli il motore per i modelli compatibili. PrismML richiede WebGPU e Chrome JSPI; il cambio ricarica il modello.'},fr:{webEngine:'Moteur du modèle',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp standard',engineChanged:'Moteur modifié. Le modèle sera rechargé au prochain message.',engineHelp:'Choisissez le moteur. PrismML nécessite WebGPU et Chrome JSPI ; le modèle sera rechargé.'},de:{webEngine:'Modell-Engine',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp Standard',engineChanged:'Engine geändert. Das Modell wird bei der nächsten Nachricht neu geladen.',engineHelp:'Wähle die Engine. PrismML benötigt WebGPU und Chrome JSPI; das Modell wird neu geladen.'},es:{webEngine:'Motor del modelo',enginePrism:'PrismML (WebGPU)',engineStandard:'llama.cpp estándar',engineChanged:'Motor cambiado. El modelo se cargará de nuevo en el siguiente mensaje.',engineHelp:'Elige el motor. PrismML requiere WebGPU y Chrome JSPI; el modelo se recargará.'}};\nfor(const lang of Object.keys(webEngineStrings)) Object.assign(translations[lang],webEngineStrings[lang]);\n")
    replace_file(app / 'hub.js', 'export const WEB_FILE_LIMIT = 2_000_000_000;', 'export const WEB_FILE_LIMIT = 3_000_000_000;')
    database = 'usb-ai-web-prism-fast-v1' if base_path == '/prism-fast/' else 'usb-ai-web-prism-gpu-experimental-v1'
    replace_file(app / 'storage.js', "const DB = 'usb-ai-web-v1'", f"const DB = '{database}'")
    replace_file(app / 'main.js', 'llamanest-remote-panel-open', 'llamanest-prism-gpu-remote-panel-open')
    replace_file(app / 'folder-models.js', 'usb-ai-models', 'usb-ai-prism-gpu-models')
    replace_file(app / 'public' / 'sw.js', 'usb-ai-web-shell-', 'usb-ai-prism-fast-shell-' if base_path == '/prism-fast/' else 'usb-ai-prism-gpu-shell-')
    config = app / 'vite.config.js'
    replace_file(config, "copyFileSync(resolve(base, 'wllama.wasm'), resolve(dest, 'wllama.wasm'));", "copyFileSync(resolve(base, 'wllama.wasm'), resolve(dest, 'standard-wllama.wasm'));\n    copyFileSync(resolve(import.meta.dirname, 'prism-webgpu.wasm'), resolve(dest, 'prism-webgpu.wasm'));")
    html = app / 'index.html'
    replace_file(html, '<div id="model-progress"', '<section id="bonsai-recommendation" style="background:#ecf8f0;border:1px solid #9bceb0;border-radius:14px;padding:18px;margin-bottom:18px"><strong id="bonsai-title"></strong><p id="bonsai-description" class="hint"></p><button id="bonsai-start" type="button" class="action" style="background:#137a49;color:white;border:0"></button></section><div id="model-progress"')
    replace_file(html, '<h3 data-i18n="generationSettings"></h3>', '<h3 data-i18n="generationSettings"></h3><label><span data-i18n="webEngine"></span> <select id="web-engine"><option value="prism" data-i18n="enginePrism"></option><option value="standard" data-i18n="engineStandard"></option></select></label><p class="hint" data-i18n="engineHelp"></p>')
    banner = '''<div id="prism-gpu-notice" style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">Experimental Prism WebGPU: GPU for model layers; some operations run on CPU. Chrome on Apple Silicon tested; performance varies. Separate browser data.</div><script>const m={it:'Prism WebGPU sperimentale: livelli del modello sulla GPU; alcune operazioni usano la CPU. Provato con Chrome su Apple Silicon; velocità variabile. Dati del browser separati.',fr:'Prism WebGPU expérimental : couches du modèle sur GPU ; certaines opérations utilisent le processeur. Testé avec Chrome sur Apple Silicon ; vitesse variable. Données séparées.',de:'Prism WebGPU experimentell: Modellebenen auf der GPU; einige Vorgänge nutzen die CPU. Mit Chrome auf Apple Silicon getestet; Geschwindigkeit variiert. Separate Browserdaten.',es:'Prism WebGPU experimental: capas del modelo en GPU; algunas operaciones usan la CPU. Probado con Chrome en Apple Silicon; velocidad variable. Datos separados.'};document.getElementById('prism-gpu-notice').textContent=m[(navigator.language||'en').slice(0,2)]||document.getElementById('prism-gpu-notice').textContent;</script>'''
    if base_path == '/prism-fast/':
        banner = '''<div id="prism-fast-notice" style="background:#fff3cd;padding:10px;text-align:center;color:#503a00">Experimental Bonsai GPU test: performance and correctness are not guaranteed. Browser data is separate; import a local GGUF or download it again.</div><script>const m={it:'Test sperimentale Bonsai GPU: velocità e correttezza non sono garantite. I dati del browser sono separati; importa un GGUF locale o scaricalo di nuovo.',fr:'Test expérimental Bonsai GPU : performances et précision non garanties. Données séparées ; importez ou retéléchargez le GGUF.',de:'Experimenteller Bonsai-GPU-Test: Leistung und Genauigkeit sind nicht garantiert. Getrennte Browserdaten; GGUF importieren oder erneut herunterladen.',es:'Prueba experimental Bonsai GPU: no se garantizan velocidad ni precisión. Datos separados; importa o descarga de nuevo el GGUF.'};document.getElementById('prism-fast-notice').textContent=m[(navigator.language||'en').slice(0,2)]||document.getElementById('prism-fast-notice').textContent;</script>'''
    replace_file(html, '<body>', '<body>' + banner)
    env = dict(os.environ, USB_AI_WEB_BASE=base_path)
    subprocess.run(['npm', 'run', 'build'], cwd=work, env=env, check=True)
    shutil.copytree(work / 'dist', dest, dirs_exist_ok=True)
