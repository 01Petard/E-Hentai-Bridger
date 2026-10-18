(async () => {
  'use strict';

  if (window.self !== window.top || !['https://e-hentai.org', 'https://exhentai.org'].includes(window.location.origin)) return;
  if (document.getElementById('eh-bridger-results-toolbar')) return;
  const table = document.querySelector('table.itg.glte');
  if (!table || !table.rows.length) return;

  // table.rows excludes the nested tag tables; unknown structures keep their native layout.
  const entries = [...table.rows].map(row => {
    const [cover, detail] = row.cells;
    const title = detail?.querySelector('.gl4e .glink');
    const name = title?.closest('.gl4e');
    const link = name?.parentElement;
    if (row.cells.length !== 2 || !cover.classList.contains('gl1e') || !detail.classList.contains('gl2e') ||
        link?.tagName !== 'A' || link.parentElement !== detail.firstElementChild) return null;
    const metadata = detail.querySelector('.gl3e');
    const parts = {
      category: metadata?.querySelector('.cn'),
      posted: metadata?.querySelector('[id^="posted_"]'),
      rating: metadata?.querySelector('.ir'),
      uploader: metadata?.querySelector('a[href*="/uploader/"]')?.parentElement,
      pages: [...(metadata?.children || [])].find(node => /^\s*[\d,]+\s*(?:pages?|页|頁)\s*$/i.test(node.textContent)),
      torrent: metadata?.querySelector('.gldown'),
    };
    return {title, link, image: cover.querySelector('img'), parts: Object.entries(parts)
      .filter(([, node]) => node).map(([part, node]) => ({part, node, originalPart: node.getAttribute('data-ehb-part')}))};
  });
  if (entries.some(entry => !entry)) return;

  const originalStyle = table.getAttribute('style');
  const ink = getComputedStyle(table).color;
  const border = getComputedStyle(table).borderTopColor;
  let surface = getComputedStyle(document.body).backgroundColor;
  for (let node = table; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor;
    if (color !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(color)) { surface = color; break; }
  }
  const toolbar = document.createElement('div');
  toolbar.id = 'eh-bridger-results-toolbar';
  toolbar.hidden = true;
  toolbar.style.setProperty('--ehb-ink', ink);
  toolbar.style.setProperty('--ehb-surface', surface);
  toolbar.style.setProperty('--ehb-border', border);
  toolbar.innerHTML = `
    <div class="ehb-heading">
      <strong>浏览增强</strong><span>${entries.length} 个画廊</span>
      <label class="ehb-toggle"><input type="checkbox" aria-label="显示原内容">显示原内容</label>
    </div>
    <div class="ehb-actions">
      <div class="ehb-layouts" role="group" aria-label="结果布局">
        <button type="button" data-layout="grid" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><rect x="12" y="12" width="5" height="5" rx="1"/></svg>网格</button>
        <button type="button" data-layout="list" aria-pressed="false"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="4" height="5" rx="1"/><rect x="3" y="12" width="4" height="5" rx="1"/><path d="M11 4h6m-6 3h4m-4 6h6m-6 3h4"/></svg>列表</button>
      </div>
    </div>`;
  table.before(toolbar);

  let saved;
  try { saved = await chrome.storage.local.get(['resultsEnhancementEnabled']); }
  catch { /* A storage failure must not prevent browsing or using the controls. */ }
  let enabled = saved?.resultsEnhancementEnabled !== false;
  let layout = 'grid';
  const toggle = toolbar.querySelector('input');
  const layoutButtons = [...toolbar.querySelectorAll('[data-layout]')];
  const searchBox = document.getElementById('searchbox');
  const navigation = table.parentElement.querySelector('.searchnav');
  const displayMode = navigation?.querySelector('select')?.parentElement;
  const placementObserver = new ResizeObserver(placeToolbar);

  function placeToolbar() {
    if (!navigation) return;
    toolbar.dataset.placement = 'inline';
    navigation.before(toolbar);
    displayMode?.removeAttribute('data-ehb-toolbar-anchor');
    const selects = [...(displayMode?.querySelectorAll(':scope > select') || [])];
    for (const select of selects) placementObserver.observe(select);
    const displaySelect = selects.find(select => select.getBoundingClientRect().width > 0 && getComputedStyle(select).visibility !== 'hidden');
    toolbar.style.setProperty('--ehb-inline-inset', displaySelect ? `${Math.max(0, toolbar.getBoundingClientRect().right - displaySelect.getBoundingClientRect().right)}px` : '0px');
    if (!searchBox || !displaySelect) return;

    // Dock above the source display selector only when its side column is actually free.
    toolbar.dataset.placement = 'sidebar';
    if (getComputedStyle(displayMode).position === 'static') displayMode.setAttribute('data-ehb-toolbar-anchor', '');
    displayMode.prepend(toolbar);
    toolbar.style.setProperty('--ehb-selector-inset', `${displayMode.getBoundingClientRect().right - displaySelect.getBoundingClientRect().right}px`);
    const search = searchBox.getBoundingClientRect();
    const controls = toolbar.getBoundingClientRect();
    if (controls.left < search.right + 12 || controls.top < search.top) {
      toolbar.dataset.placement = 'inline';
      navigation.before(toolbar);
      displayMode.removeAttribute('data-ehb-toolbar-anchor');
    }
  }

  const heading = document.createElement('div');
  heading.id = 'eh-bridger-results-heading';
  heading.setAttribute('aria-hidden', 'true');
  heading.innerHTML = '<span></span><span>发布时间</span><span>标题</span><span>上传者</span>';
  const preview = document.createElement('div');
  preview.id = 'eh-bridger-cover-preview';
  preview.setAttribute('role', 'tooltip');
  preview.setAttribute('aria-label', '画廊封面预览');
  const previewImage = document.createElement('img');
  const previewMessage = document.createElement('span');
  preview.append(previewImage, previewMessage);
  for (const element of [heading, preview]) {
    element.style.setProperty('--ehb-ink', ink);
    element.style.setProperty('--ehb-surface', surface);
    element.style.setProperty('--ehb-border', border);
  }
  let activePreview = null;

  function hidePreview() {
    activePreview = null;
    preview.remove();
    previewImage.removeAttribute('src');
  }

  function positionPreview(x, y) {
    const titleLeft = activePreview.link.getBoundingClientRect().left;
    const available = titleLeft - 24;
    preview.style.width = `${Math.max(160, Math.min(266, available))}px`;
    const {width, height} = preview.getBoundingClientRect();
    const left = available >= 160 ? titleLeft - width - 8 : x + 16;
    preview.style.left = `${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px`;
    preview.style.top = `${Math.max(12, Math.min(y + 16, window.innerHeight - height - 12))}px`;
  }

  function showPreview(entry, x, y) {
    if (!enabled || layout !== 'list') return;
    const source = entry.image?.getAttribute('data-src') || entry.image?.currentSrc || entry.image?.getAttribute('src');
    if (!source) { hidePreview(); return; }
    if (activePreview !== entry) {
      activePreview = entry;
      preview.dataset.state = 'loading';
      previewMessage.textContent = '正在加载封面';
      previewImage.alt = entry.title.textContent.trim();
      previewImage.src = source;
      document.body.append(preview);
    }
    positionPreview(x, y);
  }
  previewImage.addEventListener('load', () => { if (activePreview) preview.dataset.state = 'ready'; });
  previewImage.addEventListener('error', () => {
    if (!activePreview) return;
    preview.dataset.state = 'error';
    previewMessage.textContent = '封面暂不可用';
  });
  for (const entry of entries) {
    entry.title.addEventListener('pointerenter', event => showPreview(entry, event.clientX, event.clientY));
    entry.title.addEventListener('pointermove', event => {
      if (activePreview === entry) positionPreview(event.clientX, event.clientY);
    });
    entry.title.addEventListener('pointerleave', () => { if (activePreview === entry) hidePreview(); });
    entry.link.addEventListener('focus', () => {
      const rect = entry.title.getBoundingClientRect();
      showPreview(entry, rect.left, rect.bottom);
    });
    entry.link.addEventListener('blur', () => { if (activePreview === entry) hidePreview(); });
  }

  function apply() {
    hidePreview();
    toggle.checked = !enabled;
    for (const button of layoutButtons) {
      button.disabled = !enabled;
      button.setAttribute('aria-pressed', String(button.dataset.layout === layout));
    }
    if (enabled) {
      table.dataset.ehbLayout = layout;
      table.style.setProperty('--ehb-ink', ink);
      table.style.setProperty('--ehb-surface', surface);
      table.style.setProperty('--ehb-border', border);
      for (const entry of entries) for (const {node, part} of entry.parts) node.dataset.ehbPart = part;
      if (layout === 'list') table.before(heading);
      else heading.remove();
    } else {
      delete table.dataset.ehbLayout;
      if (originalStyle === null) table.removeAttribute('style');
      else table.setAttribute('style', originalStyle);
      for (const entry of entries) for (const {node, originalPart} of entry.parts) {
        if (originalPart === null) node.removeAttribute('data-ehb-part');
        else node.setAttribute('data-ehb-part', originalPart);
      }
      heading.remove();
    }
  }

  async function save() {
    try { await chrome.storage.local.set({resultsEnhancementEnabled: enabled}); }
    catch { /* The current page remains usable even when the preference cannot be saved. */ }
  }
  toggle.addEventListener('change', () => { enabled = !toggle.checked; apply(); void save(); });
  for (const button of layoutButtons) button.addEventListener('click', () => {
    layout = button.dataset.layout;
    apply();
    void save();
  });
  window.addEventListener('resize', () => { hidePreview(); placeToolbar(); });
  window.addEventListener('scroll', hidePreview, true);
  window.addEventListener('keydown', event => { if (event.key === 'Escape') hidePreview(); });
  apply();
  toolbar.hidden = false;
  placeToolbar();
  for (const node of [searchBox, navigation, displayMode]) if (node) placementObserver.observe(node);
})();
