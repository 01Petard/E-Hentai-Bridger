const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

// Only the DOM boundary and window.open are doubled; every case runs the real content script.
function loadBridger(href, {inFrame = false} = {}) {
  const elements = [];
  class Element extends EventTarget {
    constructor(tagName) {
      super();
      this.tagName = tagName;
      this.children = [];
    }
    append(...children) {
      this.children.push(...children);
    }
    attachShadow() {
      this.shadowRoot = new Element('#shadow-root');
      return this.shadowRoot;
    }
    setAttribute(name, value) {
      this[name] = value;
    }
  }
  const body = new Element('body');
  const document = {
    body,
    createElement(tagName) {
      const element = new Element(tagName);
      elements.push(element);
      return element;
    },
    getElementById(id) {
      return elements.find(element => element.id === id) || null;
    },
  };
  const opened = [];
  const window = {
    location: {href},
    open: (...args) => opened.push(args),
  };
  window.top = inFrame ? {} : window;
  window.self = window;
  const context = vm.createContext({document, window, URL});
  const source = fs.readFileSync(path.join(projectRoot, 'src/content/index.js'), 'utf8');
  const run = () => vm.runInContext(source, context, {filename: 'content.js'});
  run();
  return {
    body,
    elements,
    opened,
    window,
    run,
    get button() { return elements.find(element => element.tagName === 'button'); },
  };
}

test('manifest restricts automatic injection to the two HTTPS source sites and the top frame', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'Gallery Lens Bridger');
  assert.equal(manifest.content_scripts.length, 1);
  const script = manifest.content_scripts[0];
  assert.deepEqual(script.matches, ['https://e-hentai.org/*', 'https://exhentai.org/*']);
  assert.equal(script.all_frames, false);
  assert.equal(script.run_at, 'document_idle');
  assert.ok(!script.match_about_blank);
  assert.ok(!script.match_origin_as_fallback);
  assert.deepEqual(script.js, ['content.js']);
  for (const key of ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions']) {
    assert.equal(manifest[key]?.length || 0, 0);
  }
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.action, undefined);
});

for (const host of ['e-hentai.org', 'exhentai.org']) {
  test(`${host}: plain homepage shows a disabled button and cannot open a tab`, () => {
    const bridger = loadBridger(`https://${host}/`);
    assert.ok(bridger.button);
    assert.equal(bridger.button.disabled, true);
    assert.equal(bridger.button.title, '首页无需跳转');
    bridger.button.dispatchEvent(new Event('click'));
    assert.equal(bridger.opened.length, 0);
  });

  for (const [sourcePath, expectedPath] of [
    ['/g/4263226/4c2ab5ac26/', '/gallery'],
    ['/g/arbitrary-value', '/gallery'],
    ['/g/', '/gallery'],
    ['/?f_search=landscape&page=2', '/'],
    ['/uploader/Example', '/'],
    ['/s/abcd/4263226-1', '/'],
    ['/tag/landscape', '/'],
    ['/g', '/'],
  ]) {
    test(`${host}${sourcePath}: opens the matching Gallery Lens route with the complete source URL`, () => {
      const sourceUrl = `https://${host}${sourcePath}`;
      const bridger = loadBridger(sourceUrl);
      assert.equal(bridger.button.disabled, false);
      assert.equal(bridger.button.textContent, '在 Gallery Lens 中打开');
      bridger.button.dispatchEvent(new Event('click'));
      assert.equal(bridger.opened.length, 1);
      const [targetUrl, target, features] = bridger.opened[0];
      const parsed = new URL(targetUrl);
      assert.equal(parsed.origin, 'https://e-gallery.bugstack.top');
      assert.equal(parsed.pathname, expectedPath);
      assert.deepEqual([...parsed.searchParams.keys()], ['url']);
      assert.equal(parsed.searchParams.get('url'), sourceUrl);
      assert.equal(parsed.hash, '');
      assert.equal(target, '_blank');
      assert.equal(features, 'noopener,noreferrer');
    });
  }
}

test('the supplied gallery example is encoded exactly once', () => {
  const bridger = loadBridger('https://exhentai.org/g/4263226/4c2ab5ac26/');
  bridger.button.dispatchEvent(new Event('click'));
  assert.equal(bridger.opened[0][0], 'https://e-gallery.bugstack.top/gallery?url=https%3A%2F%2Fexhentai.org%2Fg%2F4263226%2F4c2ab5ac26%2F');
});

test('query parameters, Chinese, plus, percent escapes and fragments survive one decoding pass', () => {
  const sourceUrl = 'https://e-hentai.org/?f_search=中文+a%2Bb%25&f_cats=0&page=2#位置';
  const bridger = loadBridger(sourceUrl);
  bridger.button.dispatchEvent(new Event('click'));
  const targetUrl = new URL(bridger.opened[0][0]);
  assert.equal(targetUrl.searchParams.get('url'), sourceUrl);
  assert.deepEqual([...targetUrl.searchParams.keys()], ['url']);
  assert.equal(targetUrl.hash, '');
});

for (const sourceUrl of [
  'http://e-hentai.org/g/1/abc/',
  'http://exhentai.org/',
  'https://example.com/',
  'https://e-gallery.bugstack.top/',
  'https://www.e-hentai.org/',
  'https://forums.e-hentai.org/',
  'https://e-hentai.org.evil.example/',
  'https://exhentai.org.evil.example/',
  'https://e-hentai.org@evil.example/',
  'https://e-hentai.org:8443/',
  'https://exhentai.org:8443/',
]) {
  test(`${sourceUrl}: runtime guard leaves the page untouched`, () => {
    const bridger = loadBridger(sourceUrl);
    assert.equal(bridger.body.children.length, 0);
    assert.equal(bridger.button, undefined);
    assert.equal(bridger.opened.length, 0);
  });
}

test('matching sites do not receive a button inside an iframe', () => {
  const bridger = loadBridger('https://exhentai.org/g/1/abc/', {inFrame: true});
  assert.equal(bridger.button, undefined);
});

test('repeated injection does not add duplicate buttons', () => {
  const bridger = loadBridger('https://exhentai.org/g/1/abc/');
  bridger.run();
  assert.equal(bridger.body.children.length, 1);
  assert.equal(bridger.elements.filter(element => element.tagName === 'button').length, 1);
});

test('clicking reads the current URL instead of the URL at injection time', () => {
  const bridger = loadBridger('https://e-hentai.org/?f_search=old');
  bridger.window.location.href = 'https://e-hentai.org/g/4263226/4c2ab5ac26/?p=2';
  bridger.button.dispatchEvent(new Event('click'));
  const targetUrl = new URL(bridger.opened[0][0]);
  assert.equal(targetUrl.pathname, '/gallery');
  assert.equal(targetUrl.searchParams.get('url'), bridger.window.location.href);
});

test('clicking after a URL change to the homepage or another origin cannot open a tab', () => {
  for (const href of ['https://exhentai.org/', 'https://example.com/']) {
    const bridger = loadBridger('https://exhentai.org/g/1/abc/');
    bridger.window.location.href = href;
    bridger.button.dispatchEvent(new Event('click'));
    assert.equal(bridger.opened.length, 0);
  }
});
