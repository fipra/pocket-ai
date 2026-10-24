(function () {
  const labels = {
    en: { copy: 'Copy', copied: 'Copied', preview: 'Preview app', close: 'Close', save: 'Save app ZIP', missing: 'Missing generated file: ' },
    it: { copy: 'Copia', copied: 'Copiato', preview: 'Anteprima app', close: 'Chiudi', save: 'Salva app ZIP', missing: 'File generato mancante: ' },
    de: { copy: 'Kopieren', copied: 'Kopiert', preview: 'App-Vorschau', close: 'Schließen', save: 'App als ZIP speichern', missing: 'Fehlende generierte Datei: ' },
    fr: { copy: 'Copier', copied: 'Copié', preview: 'Aperçu de l’app', close: 'Fermer', save: 'Enregistrer le ZIP', missing: 'Fichier généré manquant : ' },
    es: { copy: 'Copiar', copied: 'Copiado', preview: 'Vista previa', close: 'Cerrar', save: 'Guardar app ZIP', missing: 'Falta el archivo generado: ' }
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
  const localPath = value => {
    const path = value.trim().replace(/^\.\//, '');
    return path && !path.startsWith('/') && !path.split('/').includes('..') &&
      /^[\w./-]+$/.test(path) && !path.includes('//') ? path : null;
  };
  function appFiles(parts) {
    const html = parts.find(part => part.type === 'code' && /^(html|htm)$/.test(part.language));
    if (!html) return null;
    const css = parts.find(part => part.type === 'code' && part.language === 'css');
    const js = parts.find(part => part.type === 'code' && /^(js|javascript)$/.test(part.language));
    const cssRefs = [...html.text.matchAll(/<link\b[^>]*\bhref\s*=\s*["']([^"']+\.css)["'][^>]*>/gi)].map(match => match[1]);
    const jsRefs = [...html.text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+\.js)["'][^>]*>\s*<\/script>/gi)].map(match => match[1]);
    const localCss = cssRefs.map(localPath).filter(Boolean);
    const localJs = jsRefs.map(localPath).filter(Boolean);
    const missing = [];
    if (localCss.length && !css) missing.push(...localCss);
    if (localJs.length && !js) missing.push(...localJs);
    if (localCss.length > 1) missing.push(...localCss.slice(1));
    if (localJs.length > 1) missing.push(...localJs.slice(1));
    const cssName = localCss[0] || 'style.css';
    const jsName = localJs[0] || 'app.js';
    let page = html.text;
    if (css && !localCss.length) {
      const link = `<link rel="stylesheet" href="${cssName}">`;
      page = /<\/head>/i.test(page) ? page.replace(/<\/head>/i, `${link}</head>`) : `${link}\n${page}`;
    }
    if (js && !localJs.length) {
      const script = `<script src="${jsName}"></script>`;
      page = /<\/body>/i.test(page) ? page.replace(/<\/body>/i, `${script}</body>`) : `${page}\n${script}`;
    }
    const files = [{ name: 'index.html', text: page }];
    if (css) files.push({ name: cssName, text: css.text });
    if (js) files.push({ name: jsName, text: js.text });
    return { files, missing };
  }
  function previewDocument(parts, html) {
    const app = appFiles(parts) || { files: [{ name: 'index.html', text: html }], missing: [] };
    let page = app.files[0].text;
    for (const file of app.files.slice(1)) {
      if (file.name.endsWith('.css')) {
        page = page.replace(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
          (tag, href) => localPath(href) === file.name ? `<style>${file.text.replace(/<\/style/gi, '<\\/style')}</style>` : tag);
      } else if (file.name.endsWith('.js')) {
        page = page.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi,
          (tag, src) => localPath(src) === file.name ? `<script>${file.text.replace(/<\/script/gi, '<\\/script')}</script>` : tag);
      }
    }
    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:; form-action 'none'; base-uri 'none'">`;
    return /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, match => match + csp) : csp + page;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let value = n;
    for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    return value >>> 0;
  });
  function zipFiles(files) {
    const encoder = new TextEncoder();
    const chunks = [], directory = [];
    let offset = 0;
    const push = bytes => { chunks.push(bytes); offset += bytes.length; };
    for (const file of files) {
      const name = encoder.encode(file.name), data = encoder.encode(file.text);
      let crc = 0xffffffff;
      for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
      crc = (crc ^ 0xffffffff) >>> 0;
      const start = offset;
      const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x0800, true);
      view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true);
      view.setUint16(26, name.length, true); local.set(name, 30); push(local); push(data);
      const central = new Uint8Array(46 + name.length), index = new DataView(central.buffer);
      index.setUint32(0, 0x02014b50, true); index.setUint16(4, 20, true); index.setUint16(6, 20, true);
      index.setUint16(8, 0x0800, true); index.setUint32(16, crc, true);
      index.setUint32(20, data.length, true); index.setUint32(24, data.length, true);
      index.setUint16(28, name.length, true); index.setUint32(42, start, true); central.set(name, 46);
      directory.push(central);
    }
    const directoryStart = offset;
    for (const entry of directory) push(entry);
    const end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0, 0x06054b50, true); view.setUint16(8, files.length, true);
    view.setUint16(10, files.length, true); view.setUint32(12, offset - directoryStart, true);
    view.setUint32(16, directoryStart, true); push(end);
    const result = new Uint8Array(offset);
    let position = 0;
    for (const chunk of chunks) { result.set(chunk, position); position += chunk.length; }
    return result;
  }
  function showPreview(parts, translations, missing) {
    const dialog = element('dialog', undefined, 'app-preview-dialog');
    const head = element('div', undefined, 'app-preview-head');
    const close = element('button', translations.close);
    close.type = 'button'; close.onclick = () => dialog.close();
    head.append(element('strong', translations.preview), close);
    dialog.append(head);
    if (missing.length) dialog.append(element('p', translations.missing + missing.join(', '), 'app-preview-warning'));
    const frame = element('iframe', undefined, 'app-preview-frame');
    frame.title = translations.preview;
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = previewDocument(parts, appFiles(parts).files[0].text);
    dialog.append(frame);
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  }
  function render(container, text, language = 'en') {
    const translations = labels[language] || labels.en;
    const parts = blocks(text || '');
    const app = appFiles(parts);
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
      if (app && part === parts.find(item => item.type === 'code' && /^(html|htm)$/.test(item.language))) {
        const preview = element('button', translations.preview);
        preview.type = 'button'; preview.onclick = () => showPreview(parts, translations, app.missing);
        const save = element('button', translations.save);
        save.type = 'button'; save.disabled = app.missing.length > 0;
        save.title = app.missing.length ? translations.missing + app.missing.join(', ') : translations.save;
        save.onclick = () => {
          const url = URL.createObjectURL(new Blob([zipFiles(app.files)], { type: 'application/zip' }));
          const link = element('a'); link.href = url; link.download = 'usb-ai-app.zip'; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        };
        bar.append(preview, save);
      }
      const pre = element('pre');
      pre.append(element('code', part.text));
      shell.append(bar, pre);
      container.append(shell);
    }
  }
  window.USB_AI_CODE_VIEW = { render, blocks, appFiles, previewDocument, zipFiles };
})();
