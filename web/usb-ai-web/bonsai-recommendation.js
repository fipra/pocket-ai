export const BONSAI_HASH = '7a89ab48f5038c704480f60781f9b8d4035351f5f6beb7d11fad80001fde23f9';
export const BONSAI_SIZE = 2416851840;
export function findSavedBonsai(models) {
  return models.find(model => model.source !== 'remote' && Number(model.size) === BONSAI_SIZE &&
    (String(model.id).includes(BONSAI_HASH) || [model.filename, model.name, model.url, ...(model.files || []).map(file => file.name)].some(value => typeof value === 'string' && value.includes('Ternary-Bonsai-2-9B-PQ2_0.gguf'))));
}
