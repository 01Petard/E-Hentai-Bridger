import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));

assert.deepEqual((await readdir(dist)).sort(), ['content.js', 'icons', 'manifest.json', 'results.css', 'results.js'], 'dist 只能包含扩展运行文件');
assert.deepEqual((await readdir(join(dist, 'icons'))).sort(), ['128.png', '16.png', '32.png', '48.png']);
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'E-Hentai Bridger');
assert.equal(manifest.version, pkg.version, '发布版本与 package.json 不一致');
assert.equal(manifest.content_scripts.length, 1);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://e-hentai.org/*', 'https://exhentai.org/*']);
assert.deepEqual(manifest.content_scripts[0].js, ['content.js', 'results.js']);
assert.deepEqual(manifest.content_scripts[0].css, ['results.css']);
assert.equal(manifest.content_scripts[0].all_frames, false);
assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
assert.deepEqual(manifest.permissions, ['storage']);
for (const key of ['host_permissions', 'optional_permissions', 'optional_host_permissions']) {
  assert.equal(manifest[key]?.length || 0, 0, `不应新增 ${key}`);
}
assert.equal(manifest.background, undefined);
assert.equal(manifest.action, undefined);
assert.deepEqual(manifest.web_accessible_resources, [{
  resources: ['icons/128.png'],
  matches: ['https://e-hentai.org/*', 'https://exhentai.org/*'],
}]);
assert.deepEqual(manifest.icons, {'16': 'icons/16.png', '32': 'icons/32.png', '48': 'icons/48.png', '128': 'icons/128.png'});
for (const size of [16, 32, 48, 128]) {
  const metadata = await sharp(await readFile(join(dist, manifest.icons[size]))).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, size, `图标宽度应为 ${size}px`);
  assert.equal(metadata.height, size, `图标高度应为 ${size}px`);
  assert.equal(metadata.hasAlpha, true);
}
assert.deepEqual(await readFile(join(dist, 'manifest.json')), await readFile(join(root, 'public/manifest.json')), 'Manifest 已更改，请重新构建');
assert.deepEqual(await readFile(join(dist, 'content.js')), await readFile(join(root, 'src/content/index.js')), '内容脚本已更改，请重新构建');
for (const name of ['results.js', 'results.css']) {
  assert.deepEqual(await readFile(join(dist, name)), await readFile(join(root, 'src/content', name)), `${name} 已更改，请重新构建`);
}
console.log('Release validation passed');
