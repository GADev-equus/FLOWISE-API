import { readFile, writeFile } from 'node:fs/promises';

const pkgPath = new URL('./package.json', import.meta.url);
const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
pkg.scripts.dev = 'nodemon --watch src --ext ts,json --exec "node --loader ts-node/esm src/server.ts"';
await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
