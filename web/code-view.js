(function () {
  const labels = {
    en: { copy: 'Copy', copied: 'Copied', preview: 'Preview', close: 'Close preview' },
    it: { copy: 'Copia', copied: 'Copiato', preview: 'Anteprima', close: 'Chiudi anteprima' },
    de: { copy: 'Kopieren', copied: 'Kopiert', preview: 'Vorschau', close: 'Vorschau schließen' },
    fr: { copy: 'Copier', copied: 'Copié', preview: 'Aperçu', close: 'Fermer l’aperçu' },
    es: { copy: 'Copiar', copied: 'Copiado', preview: 'Vista previa', close: 'Cerrar vista previa' }
  };
  const element = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  function blocks(text) {
    const parts = [];
    const re = /(^|\n)```([\w.+-]*)[^\n]*\n([\s\S]*?)\n```(?=\n|$)/g;
    let cursor = 0;
    for (const match of text.matchAll(re)) {
      const start = match.index + match[1].length;
      if (start > cursor) parts.push({ type: 'text', text: text.slice(cursor, start) });
      parts.push({ type: 'code', language: match[2].toLowerCase(), text: match[3] });
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parts.push({ type: 'text', text: text.slice(cursor) });
    return parts;
  }
  function previewDocument(parts, html) {
    const css = parts.filter(part => part.type === 'code' && part.language === 'css').map(part => part.text).join('\n');
    const js = parts.filter(part => part.type === 'code' && /^(js|javascript)$/.test(part.language)).map(part => part.text).join('\n');
    const style = css ? `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>` : '';
    const script = js ? `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>` : '';
    const page = html.replace(/<script\b[^>]*\bsrc\s*=\s*(['"]).*?\1[^>]*>\s*<\/script>/gis, '');
    const content = /<\/body>/i.test(page) ? page.replace(/<\/body>/i, `${style}${script}</body>`) : `${page}${style}${script}`;
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">${content}`;
  }
  function render(container, text, language = 'en') {
    const translations = labels[language] || labels.en;
    const parts = blocks(text || '');
    container.replaceChildren();
    for (const part of parts) {
      if (part.type === 'text') { container.append(element('span', part.text)); continue; }
      const shell = element('section', undefined, 'code-block');
      const bar = element('div', undefined, 'code-bar');
      bar.append(element('span', part.language || 'code'));
      const copy = element('button', translations.copy);
      copy.type = 'button';
      copy.onclick = async () => { await navigator.clipboard.writeText(part.text); copy.textContent = translations.copied; };
      bar.append(copy);
      const pre = element('pre');
      pre.append(element('code', part.text));
      shell.append(bar, pre);
      if (/^(html|htm)$/.test(part.language)) {
        const toggle = element('button', translations.preview, 'preview-toggle');
        toggle.type = 'button';
        let frame;
        toggle.onclick = () => {
          if (frame) { frame.remove(); frame = undefined; toggle.textContent = translations.preview; return; }
          frame = element('iframe', undefined, 'code-preview');
          frame.title = translations.preview;
          frame.setAttribute('sandbox', 'allow-scripts');
          frame.srcdoc = previewDocument(parts, part.text);
          shell.append(frame);
          toggle.textContent = translations.close;
        };
        bar.append(toggle);
      }
      container.append(shell);
    }
  }
  window.USB_AI_CODE_VIEW = { render, blocks, previewDocument };
})();
