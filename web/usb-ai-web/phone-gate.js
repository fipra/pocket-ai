export function isSmartphone(userAgent = navigator.userAgent, mobileHint = navigator.userAgentData?.mobile) {
  return mobileHint === true || /iPhone|iPod|Android.*Mobile/i.test(userAgent);
}

const copy = {
  en: ['USB-AI is temporarily unavailable on smartphones', 'Model loading on phones is currently too slow and unreliable. Please open USB-AI Web on a Mac or Windows computer. The desktop downloads are also available there.'],
  it: ['USB-AI non è temporaneamente disponibile su smartphone', 'Il caricamento dei modelli sul telefono è ancora troppo lento e inaffidabile. Apri USB-AI Web su un computer Mac o Windows. Da lì puoi anche scaricare le versioni desktop.'],
  fr: ['USB-AI est temporairement indisponible sur smartphone', 'Le chargement des modèles sur téléphone est actuellement trop lent et peu fiable. Ouvrez USB-AI Web sur un ordinateur Mac ou Windows.'],
  de: ['USB-AI ist vorübergehend auf Smartphones nicht verfügbar', 'Das Laden von Modellen auf Smartphones ist derzeit zu langsam und unzuverlässig. Öffne USB-AI Web auf einem Mac oder Windows-Computer.'],
  es: ['USB-AI no está disponible temporalmente en móviles', 'La carga de modelos en el móvil todavía es demasiado lenta y poco fiable. Abre USB-AI Web en un ordenador Mac o Windows.']
};

export function showPhoneGate(language = navigator.language) {
  const locale = language.slice(0, 2).toLowerCase();
  const [title, detail] = copy[locale] || copy.en;
  document.documentElement.lang = copy[locale] ? locale : 'en';
  document.title = title;
  const main = document.createElement('main');
  main.className = 'phone-gate';
  const mark = document.createElement('div');
  mark.className = 'phone-gate-mark';
  mark.textContent = '✦';
  const heading = document.createElement('h1');
  heading.textContent = title;
  const paragraph = document.createElement('p');
  paragraph.textContent = detail;
  main.append(mark, heading, paragraph);
  document.body.replaceChildren(main);
}
