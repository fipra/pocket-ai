// Added only to the Prism Web build, after the main application definitions.
import { BONSAI_HASH, BONSAI_SIZE, findSavedBonsai } from './bonsai-recommendation.js';
const bonsaiRecommended = {
  id:`hf:${BONSAI_HASH}`,
  name:'Ternary Bonsai 2 · 9B PQ2_0', size:BONSAI_SIZE,
  url:'https://huggingface.co/prism-ml/Ternary-Bonsai-2-9B-gguf/resolve/5b2abb02362efbed46bbe204014b02837778b2c2/Ternary-Bonsai-2-9B-PQ2_0.gguf',
  source:'https://huggingface.co/prism-ml/Ternary-Bonsai-2-9B-gguf',
  sha256:BONSAI_HASH, license:'Apache-2.0'
};
const bonsaiText = {
  en:['Recommended · PrismML + Bonsai 2 9B','Run our recommended ternary model locally. Download: 2.42 GB. Requires WebGPU and Chrome JSPI.','Download and start Bonsai 9B','Start saved Bonsai 9B'],
  it:['Consigliato · PrismML + Bonsai 2 9B','Usa in locale il modello ternario consigliato. Download: 2,42 GB. Richiede WebGPU e Chrome con JSPI.','Scarica e avvia Bonsai 9B','Avvia Bonsai 9B già salvato'],
  fr:['Recommandé · PrismML + Bonsai 2 9B','Utilisez notre modèle ternaire en local. Téléchargement : 2,42 Go. Nécessite WebGPU et Chrome avec JSPI.','Télécharger et lancer Bonsai 9B','Lancer Bonsai 9B enregistré'],
  de:['Empfohlen · PrismML + Bonsai 2 9B','Nutze das empfohlene ternäre Modell lokal. Download: 2,42 GB. Benötigt WebGPU und Chrome mit JSPI.','Bonsai 9B laden und starten','Gespeichertes Bonsai 9B starten'],
  es:['Recomendado · PrismML + Bonsai 2 9B','Usa en local el modelo ternario recomendado. Descarga: 2,42 GB. Requiere WebGPU y Chrome con JSPI.','Descargar e iniciar Bonsai 9B','Iniciar Bonsai 9B guardado']
};
function savedBonsai() { return findSavedBonsai(models); }
function renderBonsaiRecommendation() {
  const section = $('bonsai-recommendation');
  if (!section) return;
  const strings = bonsaiText[language] || bonsaiText.en;
  $('bonsai-title').textContent = strings[0];
  $('bonsai-description').textContent = strings[1];
  $('bonsai-start').textContent = strings[savedBonsai() ? 3 : 2];
  $('bonsai-start').disabled = busy || (!savedBonsai() && !navigator.onLine);
}
$('bonsai-start').onclick = () => run(async () => {
  let saved = savedBonsai();
  if (!navigator.gpu || typeof WebAssembly.Suspending !== 'function') throw Error('WebGPU and Chrome JSPI are required for PrismML');
  if (!saved) {
    setBusy(true); setStatus(tr('downloading')); $('model-progress').classList.add('loading');
    await downloadVerified(bonsaiRecommended, ({loaded,total}) => { $('model-progress').textContent = `${tr('downloading')} ${Math.round(loaded/total*100)}%`; }, {preferCache:true});
    models = await allModels();
    saved = savedBonsai();
  }
  if (webEngine !== 'prism') { await unload(); setEngineMode('prism'); webEngine = 'prism'; $('web-engine').value = 'prism'; await saveSettings(); }
  await chooseModel(saved.id);
});
