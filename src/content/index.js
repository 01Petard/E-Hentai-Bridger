(() => {
  'use strict';

  const sourceOrigins = ['https://e-hentai.org', 'https://exhentai.org'];
  const currentUrl = new URL(window.location.href);
  if (window.self !== window.top || !sourceOrigins.includes(currentUrl.origin)) return;
  if (document.getElementById('gallery-lens-bridger')) return;

  function targetUrl(sourceUrl) {
    const url = new URL(sourceUrl);
    if (!sourceOrigins.includes(url.origin)) return '';
    if (sourceUrl === `${url.origin}/`) return 'https://e-gallery.bugstack.top/';
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
      justify-content: center;
      width: 36px;
      height: 36px;
      padding: 0;
      border: 0;
      border-radius: 9px;
      background: transparent;
      box-shadow: 0 2px 8px rgb(0 0 0 / 18%);
      cursor: pointer;
      opacity: 0.5;
    }
    button:hover { opacity: 1; }
    button:focus-visible {
      opacity: 1;
      outline: 3px solid #38bdf8;
      outline-offset: 3px;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
  `;

  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', '在 Gallery Lens 中打开');
  button.disabled = !targetUrl(window.location.href);
  button.title = '在新标签页中打开 Gallery Lens';
  const icon = document.createElement('img');
  icon.src = chrome.runtime.getURL('icons/128.png');
  icon.alt = '';
  icon.draggable = false;
  button.append(icon);
  button.addEventListener('click', () => {
    // Read again so a URL change after injection cannot produce a stale destination.
    const destination = targetUrl(window.location.href);
    if (destination) window.open(destination, '_blank', 'noopener,noreferrer');
  });

  shadow.append(style, button);
  document.body.append(host);
})();
