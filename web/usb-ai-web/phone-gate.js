export function isSmartphone(userAgent = navigator.userAgent, mobileHint = navigator.userAgentData?.mobile) {
  return mobileHint === true || /iPhone|iPod|Android.*Mobile/i.test(userAgent);
}

const copy = {
  en: ['PC and Mac only', 'Not available for smartphones yet, but we are working on it.'],
  it: ['Solo per PC e Mac', 'LlamaNest non è per smartphone al momento, ma ci stiamo lavorando.'],
  fr: ['Uniquement sur PC et Mac', 'Pas encore disponible sur smartphone, mais nous y travaillons.'],
  de: ['Nur für PC und Mac', 'Für Smartphones derzeit nicht verfügbar, aber wir arbeiten daran.'],
  es: ['Solo para PC y Mac', 'Todavía no está disponible para móviles, pero estamos trabajando en ello.']
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
