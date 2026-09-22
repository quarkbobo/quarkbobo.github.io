const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const out = path.join(__dirname, 'baseline');
fs.mkdirSync(out, { recursive: true });
const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean);
const hashes = {};
for (const f of [...new Set(files)]) {
  if (f.startsWith('docs/three-body/') || !fs.statSync(path.join(root, f)).isFile()) continue;
  hashes[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
}
fs.writeFileSync(path.join(out, 'files.json'), JSON.stringify(hashes, null, 2));
fs.writeFileSync(path.join(out, 'status.txt'), execFileSync('git', ['status', '--short'], { cwd: root }));
for (const [name, args] of [['npm-test', ['C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js', 'test']], ['layouts', ['tools/verify-archive-a.cjs']]]) {
  const start = Date.now();
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 180000 });
  fs.writeFileSync(path.join(out, name + '.log'), result.stdout + result.stderr);
  console.log(name, 'exit', result.status, 'seconds', (Date.now() - start) / 1000);
  console.log((result.stdout + result.stderr).slice(-1200));
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('baseline fingerprints:', Object.keys(hashes).length);
