import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));

assert.deepEqual((await readdir(dist)).sort(), ['content.js', 'manifest.json'], 'dist 只能包含扩展运行文件');
assert.equal(manifest.manifest_version, 3);
assert.equal(manifest.name, 'Gallery Lens Bridger');
assert.equal(manifest.version, pkg.version, '发布版本与 package.json 不一致');
assert.equal(manifest.content_scripts.length, 1);
assert.deepEqual(manifest.content_scripts[0].matches, ['https://e-hentai.org/*', 'https://exhentai.org/*']);
assert.deepEqual(manifest.content_scripts[0].js, ['content.js']);
assert.equal(manifest.content_scripts[0].all_frames, false);
assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
for (const key of ['permissions', 'host_permissions', 'optional_permissions', 'optional_host_permissions']) {
  assert.equal(manifest[key]?.length || 0, 0, `不应新增 ${key}`);
}
assert.equal(manifest.background, undefined);
assert.equal(manifest.action, undefined);
assert.deepEqual(await readFile(join(dist, 'manifest.json')), await readFile(join(root, 'public/manifest.json')), 'Manifest 已更改，请重新构建');
assert.deepEqual(await readFile(join(dist, 'content.js')), await readFile(join(root, 'src/content/index.js')), '内容脚本已更改，请重新构建');
console.log('Release validation passed');
