(() => {
  'use strict';

  const sourceOrigins = ['https://e-hentai.org', 'https://exhentai.org'];
  const currentUrl = new URL(window.location.href);
  if (window.self !== window.top || !sourceOrigins.includes(currentUrl.origin)) return;
  if (document.getElementById('gallery-lens-bridger')) return;

  function targetUrl(sourceUrl) {
    const url = new URL(sourceUrl);
    if (!sourceOrigins.includes(url.origin) || sourceUrl === `${url.origin}/`) return '';
    const baseUrl = url.pathname.startsWith('/g/')
      ? 'https://e-gallery.bugstack.top/gallery?url='
      : 'https://e-gallery.bugstack.top/?url=';
    return baseUrl + encodeURIComponent(sourceUrl);
  }

  const host = document.createElement('div');
  host.id = 'gallery-lens-bridger';
  const shadow = host.attachShadow({mode: 'open'});
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial !important;
      position: fixed !important;
      top: 16px !important;
      right: 16px !important;
      bottom: auto !important;
      left: auto !important;
      z-index: 2147483647 !important;
      display: block !important;
    }
    button {
      all: initial;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      min-height: 40px;
      padding: 10px 16px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #243247;
      color: #fff;
      font: 600 14px / 1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
      text-align: center;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
      cursor: pointer;
    }
    button:hover:not(:disabled) { background: #334155; }
    button:active:not(:disabled) { background: #172033; }
    button:focus-visible {
      outline: 3px solid #38bdf8;
      outline-offset: 3px;
    }
    button:disabled {
      border-color: #d1d5db;
      background: #e5e7eb;
      color: #6b7280;
      box-shadow: none;
      cursor: not-allowed;
    }
  `;

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '在 Gallery Lens 中打开';
  button.disabled = !targetUrl(window.location.href);
  button.title = button.disabled ? '首页无需跳转' : '在新标签页中打开 Gallery Lens';
  button.addEventListener('click', () => {
    // Read again so a URL change after injection cannot produce a stale destination.
    const destination = targetUrl(window.location.href);
    if (destination) window.open(destination, '_blank', 'noopener,noreferrer');
  });

  shadow.append(style, button);
  document.body.append(host);
})();
