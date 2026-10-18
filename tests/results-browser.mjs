import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

export async function verifyResults({context, page, extensionId, root, output, label, check}) {
  const sourceCss = await readFile(join(root, 'tests/fixtures/source-results.css'), 'utf8');
  const examples = await Promise.all([
    'f_search查询参数的响应页面.html', 'tag路径参数的响应页面.html', 'uploader路径参数页面.html',
  ].map(name => readFile(join(root, 'doc/adapt-html', name), 'utf8')));
  const documents = new Map([
    ['https://e-hentai.org/?f_search=parody%3Acyberpunk%24', examples[0]],
    ['https://e-hentai.org/tag/parody:cyberpunk', examples[1]],
    ['https://e-hentai.org/uploader/rtyrtyui', examples[2]],
    ['https://exhentai.org/arbitrary/results', examples[0]],
    ['https://e-hentai.org/', examples[0]],
  ]);
  const plain = '<!doctype html><html><body><p>No hits found</p></body></html>';
  // Preserve the real popup function; omit advertisements and upstream startup scripts.
  const clean = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace('</body>', (examples[0].match(/<script\b[^>]*>[\s\S]*?<\/script>/i)?.[0] || '') + '</body>')
    .replace('<html lang="en">', '<html lang="en" data-test-dark>');
  const handler = route => {
    const request = route.request();
    if (request.isNavigationRequest()) {
      const original = documents.get(request.url()) || plain;
      const html = clean(original);
      return route.fulfill({contentType: 'text/html; charset=utf-8', body: request.url().startsWith('https://exhentai.org') ? html : html.replace(' data-test-dark', '')});
    }
    if (request.resourceType() === 'stylesheet') return route.fulfill({contentType: 'text/css', body: sourceCss});
    if (request.resourceType() === 'image') {
      if (/\/w\//.test(request.url()) && request.url().includes('41647-sz7pack7')) return route.abort();
      return route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="340"><rect width="250" height="340" fill="#c8c5b7"/><rect x="24" y="24" width="202" height="252" fill="#e9e6da"/><path d="M60 224 120 108 190 224Z" fill="#aaa692"/><text x="125" y="308" text-anchor="middle" fill="#56513f" font-family="sans-serif" font-size="16">Gallery cover</text></svg>'});
    }
    return route.fulfill({body: ''});
  };
  const pattern = /^https?:\/\//;
  await context.route(pattern, handler);
  const control = await context.newPage();
  await control.goto(`chrome-extension://${extensionId}/icons/128.png`);
  const setPreferences = values => control.evaluate(values => chrome.storage.local.set(values), values);
  const toolbar = page.locator('#eh-bridger-results-toolbar');
  const table = page.locator('table.itg.glte');
  const originalContent = () => toolbar.getByRole('checkbox', {name: '显示原内容'});
  const layout = async () => {
    await toolbar.waitFor({timeout: 5000});
    await originalContent().waitFor();
    return table.getAttribute('data-ehb-layout');
  };
  try {
    await setPreferences({resultsLayout: 'list'});
    for (const url of documents.keys()) {
      await page.goto(url);
      assert.equal(await layout(), 'grid');
      assert.equal(await table.locator(':scope > tbody > tr').count(), 25);
      assert.equal(await page.getByRole('button', {name: '在 Gallery Lens 中打开'}).count(), 1);
      check(`Extended structure: ${url}`);
    }

    await page.goto([...documents.keys()][0]);
    assert.equal(await layout(), 'grid');
    const placement = await toolbar.evaluate(node => {
      const search = document.getElementById('searchbox').getBoundingClientRect();
      const controls = node.getBoundingClientRect();
      const mode = document.querySelector('.searchnav select').getBoundingClientRect();
      const rightAligned = [node, node.querySelector('.ehb-heading'), node.querySelector('[data-layout="list"]')]
        .every(element => Math.abs(element.getBoundingClientRect().right - mode.right) <= 1);
      const table = document.querySelector('table.itg.glte');
      const top = table.getBoundingClientRect().top;
      const parent = node.parentElement;
      const next = node.nextSibling;
      node.remove();
      const nativeTop = table.getBoundingClientRect().top;
      parent.insertBefore(node, next);
      return {besideSearch: controls.left >= search.right + 8, aboveMode: controls.bottom <= mode.top - 4, rightAligned, addedHeight: top - nativeTop};
    });
    assert.equal(placement.besideSearch, true, 'wide layouts dock controls in the empty column beside search');
    assert.equal(placement.aboveMode, true);
    assert.equal(placement.rightAligned, true, 'both toolbar rows align with the native display selector right edge');
    assert.ok(Math.abs(placement.addedHeight) <= 1, 'docked controls must not push results down');
    assert.equal(await toolbar.locator('.ehb-heading span').evaluate(node => getComputedStyle(node).color === getComputedStyle(node.closest('#eh-bridger-results-toolbar')).color), true, 'gallery count retains source text contrast inside pagination');
    const headingBox = await toolbar.locator('.ehb-heading strong').boundingBox();
    const toggleBox = await originalContent().boundingBox();
    assert.ok(Math.abs(headingBox.y + headingBox.height / 2 - toggleBox.y - toggleBox.height / 2) <= 2, 'original-content switch belongs on the first line');
    check('Gallery count stays readable and the original-content switch shares the first toolbar line');
    await page.setViewportSize({width: 900, height: 800});
    await page.waitForFunction(() => getComputedStyle(document.getElementById('eh-bridger-results-toolbar')).position !== 'absolute');
    assert.equal(await toolbar.evaluate(node => {
      const box = node.getBoundingClientRect();
      const search = document.getElementById('searchbox').getBoundingClientRect();
      const nav = document.querySelector('.searchnav').getBoundingClientRect();
      return box.height <= 34 && box.top >= search.bottom && box.bottom <= nav.top && box.left >= 0 && box.right <= innerWidth;
    }), true, 'narrow controls fit one compact row without overlapping search or pagination');
    assert.equal(await toolbar.locator('[data-layout="list"]').evaluate(node => Math.abs(node.getBoundingClientRect().right - document.querySelector('.searchnav select').getBoundingClientRect().right) <= 1), true, 'inline controls align with the display selector too');
    await toolbar.evaluate(node => node.scrollIntoView({block: 'start'}));
    assert.equal(await toolbar.locator('.ehb-actions').evaluate(node => {
      const controls = node.getBoundingClientRect();
      const icon = document.getElementById('gallery-lens-bridger').getBoundingClientRect();
      return controls.right <= icon.left || controls.bottom <= icon.top || controls.top >= icon.bottom;
    }), true, 'scrolled controls must not overlap the fixed Gallery Lens icon');
    await page.setViewportSize({width: 1280, height: 800});
    await page.waitForFunction(() => getComputedStyle(document.getElementById('eh-bridger-results-toolbar')).position === 'absolute');
    check('Controls dock beside search without taking content height; narrow windows use a compact row above pagination');
    const snapshot = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('table.itg.glte').outerHTML, examples[0]);
    const firstRow = table.locator(':scope > tbody > tr').first();
    const titleBox = await firstRow.locator('.glink').boundingBox();
    const coverBox = await firstRow.locator('.gl1e').boundingBox();
    const categoryBox = await firstRow.locator('.cn').boundingBox();
    assert.ok(titleBox.y + titleBox.height <= coverBox.y + 1, 'grid titles belong above covers');
    assert.ok(coverBox.y + coverBox.height <= categoryBox.y + 1, 'grid metadata belongs below covers');
    assert.equal(categoryBox.height, 18, 'grid category badges override the native 35px height');
    assert.ok(categoryBox.width <= 110, 'grid category badges remain compact');
    assert.equal(await firstRow.locator('.gl4e > div:not(.glink)').isVisible(), false, 'reference grid omits tags');
    assert.equal(await firstRow.evaluate(node => getComputedStyle(node).borderRadius), '0px');
    await page.locator('#searchbox').evaluate(node => node.scrollIntoView({block: 'start'}));
    await page.screenshot({path: join(output, `results-grid-${label}.png`), fullPage: false});
    check('Reference grid: title above cover, compact metadata below, no tags or rounded cards');

    await toolbar.getByRole('button', {name: '列表', exact: true}).click();
    assert.equal(await table.getAttribute('data-ehb-layout'), 'list');
    assert.deepEqual(await page.locator('#eh-bridger-results-heading > span').allTextContents(), ['', '发布时间', '标题', '上传者']);
    assert.equal(await table.evaluate(node => {
      const heading = document.getElementById('eh-bridger-results-heading');
      const bounds = node.getBoundingClientRect();
      const header = heading.getBoundingClientRect();
      const title = node.querySelector('.glink').getBoundingClientRect();
      const headerTitle = heading.children[2];
      const headerTextLeft = headerTitle.getBoundingClientRect().left + parseFloat(getComputedStyle(headerTitle).paddingLeft);
      return Math.abs(bounds.left - header.left) <= 1 && Math.abs(bounds.right - header.right) <= 1 && Math.abs(title.left - headerTextLeft) <= 1;
    }), true, 'list heading and body share column edges despite native table width and padding');
    assert.equal(await table.locator('.gl1e').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'none')), true);
    assert.ok((await firstRow.boundingBox()).height <= 54, 'a one-line tag summary fits the reference list row height');
    assert.equal(await firstRow.locator('.gl4e .gt, .gl4e .gtl').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).borderStyle === 'solid' && getComputedStyle(node).cssFloat === 'none')), true, 'all list tags use solid inline chips');
    assert.equal(await firstRow.locator('td.gl2e > div > a').evaluate(node => {
      const style = getComputedStyle(node);
      return style.borderLeftWidth === '1px' && style.borderRightWidth === '1px';
    }), true, 'title cells provide continuous column dividers');
    assert.equal(await table.locator(':scope > tbody > tr').evaluateAll(nodes => getComputedStyle(nodes[0]).backgroundColor !== getComputedStyle(nodes[1]).backgroundColor), true, 'alternating rows retain source-style shading');
    assert.equal(await table.locator('.tc').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).display === 'none')), true, 'list tags use a flat chip layout');
    assert.equal(await table.locator('.gl4e > div:not(.glink)').evaluateAll(nodes => nodes.every(node => node.scrollHeight <= node.clientHeight + 1)), true);
    await page.screenshot({path: join(output, `results-list-${label}.png`), fullPage: false});

    const preview = page.locator('#eh-bridger-cover-preview');
    const previewTitle = table.locator('.glink').nth(1);
    const coverUrl = await table.locator('.gl1e img').nth(1).getAttribute('src');
    await previewTitle.hover();
    await preview.waitFor();
    await preview.locator('img').evaluate(image => image.decode());
    assert.equal(await preview.locator('img').getAttribute('src'), coverUrl);
    const previewBox = await preview.boundingBox();
    assert.ok(previewBox.x >= 0 && previewBox.y >= 0 && previewBox.x + previewBox.width <= 1280 && previewBox.y + previewBox.height <= 800);
    assert.ok(previewBox.x + previewBox.width <= (await previewTitle.boundingBox()).x, 'cover previews stay beside the title column');
    await page.screenshot({path: join(output, `results-preview-${label}.png`)});
    await page.mouse.move(0, 0);
    assert.equal(await preview.count(), 0, 'leaving the title dismisses the preview');
    await previewTitle.evaluate(node => node.closest('a').focus());
    await preview.waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await preview.count(), 0);
    await table.locator('.glink').first().hover();
    await preview.getByText('封面暂不可用').waitFor();
    await toolbar.getByRole('button', {name: '网格', exact: true}).click();
    assert.equal(await preview.count(), 0);
    await toolbar.getByRole('button', {name: '列表', exact: true}).click();
    check('Cover-free list: hover/focus preview, viewport bounds, image failure and dismissal on leave/Escape/layout change');
    await page.reload();
    assert.equal(await layout(), 'grid');
    await page.goto('https://exhentai.org/arbitrary/results');
    assert.equal(await layout(), 'grid');
    check('Each page starts in grid mode on both source origins, ignoring an old saved list preference');

    await page.goto([...documents.keys()][0]);
    assert.equal(await layout(), 'grid');
    await toolbar.getByRole('button', {name: '列表', exact: true}).click();
    await page.evaluate(() => {
      window.originalTitle = document.querySelector('.gl4e .glink');
      window.originalFavorite = document.querySelector('[id^="posted_"]');
    });
    await originalContent().check();
    assert.equal(await table.getAttribute('data-ehb-layout'), null);
    assert.equal(await table.evaluate(node => node.outerHTML) === snapshot, true, 'disabling must restore the exact source table');
    assert.equal(await page.evaluate(() => originalTitle === document.querySelector('.gl4e .glink') && originalFavorite === document.querySelector('[id^="posted_"]')), true);
    await originalContent().uncheck();
    assert.equal(await table.getAttribute('data-ehb-layout'), 'list');
    await originalContent().check();
    await page.reload();
    await toolbar.waitFor();
    assert.equal(await originalContent().isChecked(), true);
    assert.equal(await table.getAttribute('data-ehb-layout'), null);
    await originalContent().uncheck();
    assert.equal(await table.getAttribute('data-ehb-layout'), 'grid');
    await toolbar.getByRole('button', {name: '列表', exact: true}).click();
    check('Disable restores the exact source table and original nodes; the switch persists and same-page layout is retained');

    // Original inline handlers remain callable on the enhanced table.
    const favorite = table.locator('[id^="posted_"]').first();
    let popupEvent = context.waitForEvent('page');
    await favorite.click();
    let popup = await popupEvent;
    await popup.waitForLoadState('domcontentloaded');
    assert.match(popup.url(), /gallerypopups\.php\?gid=4263077&t=047f498f72&act=addfav/);
    await popup.close();
    popupEvent = context.waitForEvent('page');
    await table.locator('.gldown a').first().click();
    popup = await popupEvent;
    await popup.waitForLoadState('domcontentloaded');
    assert.match(popup.url(), /gallerytorrents\.php\?gid=/);
    await popup.close();
    const uploader = table.locator('.gl3e a[href*="/uploader/"]').first();
    await uploader.click();
    await page.waitForURL('https://e-hentai.org/uploader/rtyrtyui');
    await layout();
    const nextUrl = await page.locator('#unext').getAttribute('href');
    await page.locator('#unext').click();
    await page.waitForURL(nextUrl);
    check('Native favorites, torrent popups, uploader links and pagination still operate');

    await setPreferences({resultsEnhancementEnabled: true, resultsLayout: 'grid'});
    await page.goto('https://exhentai.org/arbitrary/results');
    assert.equal(await layout(), 'grid');
    assert.equal(await toolbar.evaluate(node => getComputedStyle(node).color), 'rgb(221, 221, 221)');
    await toolbar.evaluate(node => node.scrollIntoView({block: 'start'}));
    await page.screenshot({path: join(output, `results-dark-${label}.png`)});
    for (const width of [1280, 900]) {
      await page.setViewportSize({width, height: 800});
      for (const name of ['网格', '列表']) {
        await toolbar.getByRole('button', {name, exact: true}).click();
        assert.equal(await table.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
        assert.equal(await table.locator('.gl1e img').first().evaluate(node => getComputedStyle(node).objectFit), 'contain');
      }
    }
    await toolbar.evaluate(node => node.scrollIntoView({block: 'start'}));
    await page.screenshot({path: join(output, `results-narrow-${label}.png`)});
    await page.setViewportSize({width: 1280, height: 800});
    check('Source colors, uncropped covers, broken image and long tags at regular and narrow desktop widths');

    const source = await readFile(join(root, 'src/content/results.js'), 'utf8');
    await page.evaluate(source => { void eval(source); void eval(source); }, source);
    assert.equal(await toolbar.count(), 1);
    check('Repeated initialization does not duplicate the toolbar');

    await toolbar.getByRole('button', {name: '网格', exact: true}).click();
    assert.equal(await table.locator('.glink').first().evaluate(node => {
      const link = node.closest('a');
      link.focus();
      return document.activeElement === link;
    }), true, 'the original gallery title link must remain keyboard-focusable');
    const galleryUrl = await table.locator('.glink').first().evaluate(node => node.closest('a').href);
    await table.locator('.glink').first().click();
    await page.waitForURL(galleryUrl);
    check('Gallery titles retain their source-site navigation in the grid layout');

    const translated = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      for (const metadata of doc.querySelectorAll('.gl3e')) metadata.children[4].textContent = metadata.children[4].textContent.replace('pages', '页');
      const select = doc.querySelector('.searchnav select');
      const clone = select.cloneNode(true);
      clone.hidden = true;
      clone.className = 'eh-syringe-ignore';
      select.before(clone);
      doc.querySelector('.gl4e > div:not(.glink)').replaceChildren(doc.createTextNode('\u00a0'));
      return doc.documentElement.outerHTML;
    }, examples[0]);
    documents.set('https://e-hentai.org/test/translated', translated);
    await setPreferences({resultsEnhancementEnabled: true, resultsLayout: 'list'});
    await page.goto('https://e-hentai.org/test/translated');
    assert.equal(await layout(), 'grid');
    await toolbar.getByRole('button', {name: '列表', exact: true}).click();
    assert.equal(await table.locator('[data-ehb-part="pages"]').count(), 25);
    assert.equal(await table.locator('[data-ehb-part="pages"]').evaluateAll(nodes => nodes.every(node => {
      const box = node.getBoundingClientRect();
      const row = node.closest('tr').getBoundingClientRect();
      return box.top >= row.top && box.bottom <= row.bottom;
    })), true, 'translated page counts stay in their rows rather than stacking at the header');
    assert.equal(await table.locator('.glink').first().evaluate(node => {
      const title = node.getBoundingClientRect();
      const row = node.closest('tr').getBoundingClientRect();
      return Math.abs(title.top + title.height / 2 - row.top - row.height / 2) <= 1;
    }), true, 'titles without tags are vertically centered');
    for (const width of [1280, 900]) {
      await page.setViewportSize({width, height: 800});
      await page.waitForFunction(() => {
        const button = document.querySelector('#eh-bridger-results-toolbar [data-layout="list"]');
        const select = [...document.querySelectorAll('.searchnav select')].find(node => node.getBoundingClientRect().width > 0);
        return Math.abs(button.getBoundingClientRect().right - select.getBoundingClientRect().right) <= 1;
      });
    }
    await page.setViewportSize({width: 1280, height: 800});
    await page.locator('#eh-bridger-results-heading').evaluate(node => node.scrollIntoView({block: 'start'}));
    await page.screenshot({path: join(output, `results-translated-${label}.png`)});
    check('Translated page counts, empty tag rows and hidden selector copies preserve layout and alignment');

    const sparse = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const row = doc.querySelector('table.itg.glte').rows[0];
      row.querySelector('.gl3e').remove();
      row.querySelector('.gl1e img').remove();
      row.querySelector('.gl4e > div:not(.glink)').remove();
      return doc.documentElement.outerHTML;
    }, examples[0]);
    documents.set('https://e-hentai.org/test/sparse', sparse);
    await setPreferences({resultsEnhancementEnabled: 'invalid', resultsLayout: 'invalid'});
    await page.goto('https://e-hentai.org/test/sparse');
    assert.equal(await layout(), 'grid');
    assert.equal(await originalContent().isChecked(), false);
    assert.equal(await table.locator('.glink').count(), 25);
    assert.equal(await table.locator('.glink').first().isVisible(), true);
    check('Missing optional metadata, tags and cover leave the remaining results readable');

    documents.set('https://example.com/extended', examples[0]);
    await page.goto('https://example.com/extended');
    assert.equal(await table.count(), 1);
    assert.equal(await toolbar.count(), 0);
    documents.set('https://e-hentai.org/test/frame', '<iframe src="https://e-hentai.org/test/sparse"></iframe>');
    await page.goto('https://e-hentai.org/test/frame');
    const frame = await page.locator('iframe').elementHandle();
    const child = await frame.contentFrame();
    await child.locator('table.itg.glte').waitFor();
    assert.equal(await child.locator('#eh-bridger-results-toolbar, [data-ehb-layout]').count(), 0);
    check('Matching Extended markup on a different origin or inside an iframe is untouched');

    for (const [name, html] of [
      ['non-Extended', examples[0].replace('itg glte', 'itg gltc')],
      ['empty', plain],
      ['unrecognized structure', '<table class="itg glte"><tr><td>Unexpected markup</td></tr></table>'],
    ]) {
      const url = `https://e-hentai.org/test/${encodeURIComponent(name)}`;
      documents.set(url, html);
      await page.goto(url);
      await page.getByRole('button', {name: '在 Gallery Lens 中打开'}).waitFor();
      assert.equal(await toolbar.count(), 0);
      assert.equal(await page.locator('[data-ehb-layout]').count(), 0);
      check(`Unchanged: ${name}`);
    }

    // Exercise storage failure against the real DOM/script; only the extension IO is replaced.
    await page.setContent(clean(examples[0]));
    await page.addStyleTag({path: join(root, 'src/content/results.css')});
    await page.evaluate(() => {
      chrome.storage = {local: {get: async () => { throw new Error('read failed'); }, set: async () => { throw new Error('write failed'); }}};
    });
    await page.evaluate(source => eval(source), source);
    assert.equal(await layout(), 'grid');
    await toolbar.getByRole('button', {name: '列表', exact: true}).click();
    assert.equal(await table.getAttribute('data-ehb-layout'), 'list');
    await originalContent().check();
    assert.equal(await table.getAttribute('data-ehb-layout'), null);
    check('Storage failures preserve default display and current-page controls');
  } finally {
    await control.close();
    await context.unroute(pattern, handler);
  }
}
