import {watch} from 'node:fs';
import {cp, mkdir, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Script} from 'node:vm';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');

async function build() {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(root, 'public/manifest.json'), 'utf8'));
  if (manifest.version !== pkg.version) throw new Error('package.json 与 public/manifest.json 的版本不一致');
  new Script(await readFile(join(root, 'src/content/index.js'), 'utf8'), {filename: 'content.js'});

  await rm(dist, {recursive: true, force: true});
  await mkdir(dist, {recursive: true});
  await cp(join(root, 'public'), dist, {recursive: true});
  await cp(join(root, 'src/content/index.js'), join(dist, 'content.js'));
  await mkdir(join(dist, 'icons'), {recursive: true});
  const icon = await readFile(join(root, 'src/assets/icon.svg'));
  for (const size of [16, 32, 48, 128]) {
    await sharp(icon).resize(size, size).png().toFile(join(dist, `icons/${size}.png`));
  }
  console.log(`Built dist/ — E-Hentai Bridger ${pkg.version}`);
}

await build();

if (process.argv.includes('--watch')) {
  let timer;
  let pending = Promise.resolve();
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(build).catch(error => console.error(`Build failed: ${error.message}`));
    }, 100);
  };
  const watchers = [
    watch(join(root, 'src'), {recursive: true}, rebuild),
    watch(join(root, 'public'), {recursive: true}, rebuild),
    watch(join(root, 'package.json'), rebuild),
  ];
  const stop = () => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  console.log('Watching src/, public/ and package.json. Reload the extension and source page after each build.');
}
