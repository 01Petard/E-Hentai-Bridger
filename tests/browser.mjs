import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {verifyResults} from './results-browser.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'output/playwright');
const label = process.env.BRIDGER_TEST_LABEL || 'chromium';
assert.match(label, /^[a-zA-Z0-9_-]+$/, 'BRIDGER_TEST_LABEL 只能包含字母、数字、下划线或连字符');
await mkdir(output, {recursive: true});
const resultPath = join(output, `results-${label}.json`);
await rm(resultPath, {force: true});
const profile = await mkdtemp(join(tmpdir(), 'gallery-lens-bridger-browser-'));
const checks = [];
const errors = [];
const check = message => { checks.push(message); console.log(`PASS ${message}`); };
let context;

try {
  context = await chromium.launchPersistentContext(profile, {
    ...(process.env.BRIDGER_BROWSER_EXECUTABLE
      ? {executablePath: process.env.BRIDGER_BROWSER_EXECUTABLE}
      : {channel: 'chromium'}),
    headless: process.env.BRIDGER_HEADED === '0',
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
    viewport: {width: 1280, height: 800},
  });
  const session = await context.browser().newBrowserCDPSession();
  const {id} = await session.send('Extensions.loadUnpacked', {path: join(root, 'dist')});
  await session.detach();

  // Keep the release manifest unchanged; only network responses use controlled test HTML.
  const fixtureUrls = /^https?:\/\//;
  await context.route(fixtureUrls, route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>E-Hentai Bridger verification</title><style>body{font:16px system-ui;background:#f4f1e8;color:#34342f;padding:40px}button{display:none!important}h1{font-size:28px}</style><h1>E-Hentai Bridger</h1><p>扩展加载、布局与跳转测试页面。</p></html>',
  }));
  const trackErrors = page => page.on('pageerror', error => errors.push(error.message));
  context.on('page', trackErrors);
  for (const page of context.pages()) trackErrors(page);
  const page = context.pages()[0] || await context.newPage();

  for (const [source, expectedPath, key] of [
    ['https://exhentai.org/g/4263226/4c2ab5ac26/', '/gallery', 'Enter'],
    ['https://e-hentai.org/g/4263226/4c2ab5ac26/?p=2', '/gallery', 'Space'],
    ['https://e-hentai.org/?f_search=%E4%B8%AD%E6%96%87+a%2Bb%25&f_cats=0&page=2#part', '/', null],
    ['https://exhentai.org/uploader/Example', '/', null],
    ['https://exhentai.org/s/abcd/4263226-1', '/', null],
  ]) {
    await page.goto(source);
    await page.mouse.move(0, 0);
    const button = page.getByRole('button', {name: '在 Gallery Lens 中打开'});
    await button.waitFor();
    assert.equal(await button.isEnabled(), true);
    const actualSource = page.url();
    const box = await button.boundingBox();
    assert.ok(box && Math.abs(box.y - 16) < 1 && Math.abs(1280 - box.x - box.width - 16) < 1, '按钮距离顶部和右侧应为 16px');
    assert.equal(box.width, 36);
    assert.equal(box.height, 36);
    if (checks.length === 0) {
      assert.equal(await button.innerText(), '');
      const buttonIcon = button.locator('img');
      await buttonIcon.evaluate(image => image.decode());
      assert.equal(await buttonIcon.getAttribute('src'), `chrome-extension://${id}/icons/128.png`);
      assert.deepEqual(await buttonIcon.evaluate(image => [image.naturalWidth, image.naturalHeight]), [128, 128]);
      assert.equal(await button.evaluate(element => getComputedStyle(element).opacity), '0.5');
      await page.screenshot({path: join(output, `button-idle-${label}.png`)});
      await button.hover();
      assert.equal(await button.evaluate(element => getComputedStyle(element).opacity), '1');
      await page.mouse.move(0, 0);
      assert.equal(await button.evaluate(element => getComputedStyle(element).opacity), '0.5');
      check('Icon button: packaged project icon, 36px square, half opacity at rest and full opacity on hover');
    }
    if (key) {
      await page.keyboard.press('Tab');
      assert.equal(await button.evaluate(element => element.matches(':focus-visible')), true);
      assert.equal(await button.evaluate(element => getComputedStyle(element).opacity), '1');
    }
    if (key === 'Enter') await page.screenshot({path: join(output, `button-${label}.png`)});
    const popupEvent = context.waitForEvent('page');
    if (key) await page.keyboard.press(key);
    else await button.click();
    const popup = await popupEvent;
    await popup.waitForURL(url => url.hostname === 'e-gallery.bugstack.top');
    await popup.waitForLoadState('domcontentloaded');
    const target = new URL(popup.url());
    assert.equal(target.origin, 'https://e-gallery.bugstack.top');
    assert.equal(target.pathname, expectedPath);
    assert.equal(target.searchParams.get('url'), actualSource);
    assert.deepEqual([...target.searchParams.keys()], ['url']);
    assert.equal(await popup.evaluate(() => window.opener === null && document.referrer === ''), true);
    assert.equal(page.url(), actualSource);
    await popup.close();
    check(`${key || 'Click'}: ${source}`);
  }

  for (const source of ['https://e-hentai.org/', 'https://exhentai.org/']) {
    await page.goto(source);
    const button = page.getByRole('button', {name: '在 Gallery Lens 中打开'});
    await button.waitFor();
    assert.equal(await button.isEnabled(), true);
    const popupEvent = context.waitForEvent('page');
    await button.click();
    const popup = await popupEvent;
    await popup.waitForURL('https://e-gallery.bugstack.top/');
    assert.equal(popup.url(), 'https://e-gallery.bugstack.top/');
    assert.equal(page.url(), source);
    await popup.close();
    check(`Homepage: ${source}`);
  }

  for (const source of [
    'https://example.com/', 'https://www.e-hentai.org/',
    'https://e-hentai.org.evil.example/', 'http://e-hentai.org/',
    'https://exhentai.org:8443/', 'https://e-gallery.bugstack.top/',
  ]) {
    await page.goto(source);
    assert.equal(await page.locator('#gallery-lens-bridger').count(), 0);
    check(`No injection: ${source}`);
  }
  await verifyResults({context, page, extensionId: id, root, output, label, check});
  await context.unroute(fixtureUrls);
  await page.goto(`chrome-extension://${id}/icons/128.png`);
  const icon = page.locator('img');
  await icon.waitFor();
  assert.deepEqual(await icon.evaluate(image => [image.naturalWidth, image.naturalHeight]), [128, 128]);
  check('Extension icon: 128px PNG loads in the browser');
  assert.deepEqual(errors, []);
  const {version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const result = {date: new Date().toISOString(), version, browser: context.browser().version(), controlledDocuments: true, passed: checks.length, checks};
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n');
  console.log(`Browser checks passed: ${checks.length}; ${resultPath}`);
} finally {
  await context?.close();
  await rm(profile, {recursive: true, force: true});
}
