(() => {
  const phone = navigator.userAgentData?.mobile === true || /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent);
  if (!phone) return;

  const copy = {
    it: 'USB AI è temporaneamente disponibile solo su Mac e Windows. Su smartphone i modelli si caricano troppo lentamente: download e app Web sono disattivati finché il problema non sarà risolto.',
    en: 'USB AI is temporarily available only on Mac and Windows. Model loading on phones is too slow, so downloads and the Web app are disabled until this is fixed.',
    fr: 'USB AI est temporairement disponible uniquement sur Mac et Windows. Le chargement des modèles sur téléphone est trop lent ; les téléchargements et l’application Web sont désactivés.',
    de: 'USB AI ist vorübergehend nur auf Mac und Windows verfügbar. Das Laden von Modellen auf Smartphones ist zu langsam; Downloads und Web-App sind deshalb deaktiviert.',
    es: 'USB AI está disponible temporalmente solo en Mac y Windows. Los modelos tardan demasiado en cargar en móviles; las descargas y la aplicación Web están desactivadas.'
  };
  const language = document.documentElement.lang.slice(0, 2).toLowerCase();
  const message = copy[language] || copy.en;
  const notice = document.createElement('p');
  notice.className = 'mobile-unavailable';
  notice.setAttribute('role', 'status');
  notice.textContent = message;
  document.querySelector('.hero-actions')?.after(notice);

  for (const link of document.querySelectorAll('a[href="/app/"], a.download-card, .footer-links a[href*="/releases/tag/rust-"]')) {
    link.removeAttribute('href');
    link.removeAttribute('target');
    link.classList.add('platform-unavailable');
    link.setAttribute('aria-disabled', 'true');
    link.setAttribute('title', message);
    link.tabIndex = -1;
  }
})();
