import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {unzipSync} from 'fflate';
import sharp from 'sharp';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'gallery-lens-bridger-release-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const entry of ['src', 'public', 'scripts', 'package.json']) {
    await cp(join(projectRoot, entry), join(root, entry), {recursive: true});
  }
  await symlink(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'junction');
  return root;
}

function run(root, script) {
  return execFileSync(process.execPath, [join(root, 'scripts', script)], {
    cwd: tmpdir(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('build creates a clean install directory containing only the runtime files', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'dist'), {recursive: true});
  await writeFile(join(root, 'dist', 'stale.js'), 'old build');
  run(root, 'build.mjs');
  assert.deepEqual((await readdir(join(root, 'dist'))).sort(), ['content.js', 'icons', 'manifest.json']);
  assert.deepEqual((await readdir(join(root, 'dist/icons'))).sort(), ['128.png', '16.png', '32.png', '48.png']);
  for (const size of [16, 32, 48, 128]) {
    const metadata = await sharp(await readFile(join(root, `dist/icons/${size}.png`))).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.equal(metadata.hasAlpha, true);
  }
  assert.equal(await readFile(join(root, 'dist/content.js'), 'utf8'), await readFile(join(root, 'src/content/index.js'), 'utf8'));
  assert.equal(await readFile(join(root, 'dist/manifest.json'), 'utf8'), await readFile(join(root, 'public/manifest.json'), 'utf8'));
  assert.match(run(root, 'validate-release.mjs'), /Release validation passed/);
});

test('release validation rejects stale builds, unexpected files, changed permissions and version mismatches', async t => {
  const root = await fixture(t);
  for (const [name, corrupt] of [
    ['stale content', async () => writeFile(join(root, 'dist/content.js'), 'console.log("stale")')],
    ['unexpected source file', async () => writeFile(join(root, 'dist', 'README.md'), 'source documentation')],
    ['missing extension icon', async () => rm(join(root, 'dist/icons/32.png'))],
    ['wrong icon dimensions', async () => cp(join(root, 'dist/icons/16.png'), join(root, 'dist/icons/32.png'))],
    ['broader site access', async () => {
      const manifest = JSON.parse(await readFile(join(root, 'dist/manifest.json'), 'utf8'));
      manifest.content_scripts[0].matches.push('https://example.com/*');
      await writeFile(join(root, 'dist/manifest.json'), JSON.stringify(manifest));
    }],
    ['extra permissions', async () => {
      const manifest = JSON.parse(await readFile(join(root, 'dist/manifest.json'), 'utf8'));
      manifest.permissions = ['tabs'];
      await writeFile(join(root, 'dist/manifest.json'), JSON.stringify(manifest));
    }],
    ['wrong version', async () => {
      const manifest = JSON.parse(await readFile(join(root, 'dist/manifest.json'), 'utf8'));
      manifest.version = '9.9.9';
      await writeFile(join(root, 'dist/manifest.json'), JSON.stringify(manifest));
    }],
  ]) {
    await t.test(name, async () => {
      run(root, 'build.mjs');
      await corrupt();
      assert.throws(() => run(root, 'validate-release.mjs'));
    });
  }
});

test('the versioned ZIP extracts directly to an installable extension and matches dist byte for byte', async t => {
  const root = await fixture(t);
  run(root, 'build.mjs');
  run(root, 'package-release.mjs');
  const {version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const files = unzipSync(await readFile(join(root, 'release', `gallery-lens-bridger-${version}.zip`)));
  assert.deepEqual(Object.keys(files).sort(), ['content.js', 'icons/128.png', 'icons/16.png', 'icons/32.png', 'icons/48.png', 'manifest.json']);
  for (const [name, content] of Object.entries(files)) {
    assert.deepEqual(Buffer.from(content), await readFile(join(root, 'dist', name)));
  }
});
