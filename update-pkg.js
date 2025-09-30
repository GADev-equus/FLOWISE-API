const fs = require('fs');
const path = require('path');
const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.dev = 'nodemon --watch src --ext ts,json --exec "ts-node --esm src/server.ts"';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
