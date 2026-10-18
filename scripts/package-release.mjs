import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const entries = {};
for (const name of await readdir(join(root, 'dist'))) {
  entries[name] = new Uint8Array(await readFile(join(root, 'dist', name)));
}
const {name, version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(join(root, 'release'), {recursive: true});
const target = join(root, 'release', `${name}-${version}.zip`);
await writeFile(target, zipSync(entries, {level: 9}));
console.log(target);
