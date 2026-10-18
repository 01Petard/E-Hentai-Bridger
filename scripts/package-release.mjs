import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {zipSync} from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const entries = {};
async function collect(directory, prefix = '') {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) await collect(join(directory, entry.name), `${name}/`);
    else entries[name] = new Uint8Array(await readFile(join(directory, entry.name)));
  }
}
await collect(join(root, 'dist'));
const {name, version} = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(join(root, 'release'), {recursive: true});
const target = join(root, 'release', `${name}-${version}.zip`);
await writeFile(target, zipSync(entries, {level: 9}));
console.log(target);
