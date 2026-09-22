// Run the unchanged acceptance assertions against an isolated faulty module,
// then restore the copied implementation. Never mutate the running site.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), out = path.join(__dirname, 'fault-injection');
fs.mkdirSync(out, { recursive: true });
const source = fs.readFileSync(path.join(root, 'themes/fluid-particle/source/js/three-body-core.mjs'), 'utf8');
const tests = fs.readFileSync(path.join(root, 'test/three-body-core.test.cjs'), 'utf8');
const localTests = tests.replace("path.resolve(__dirname, '../themes/fluid-particle/source/js/three-body-core.mjs')", "path.resolve(__dirname, './three-body-core.mjs')");
assert.notEqual(localTests, tests);
fs.writeFileSync(path.join(out, 'three-body-core.test.cjs'), localTests);
const marker = 'const scale = G * a.mass * b.mass';
assert.ok(source.includes(marker));
for (const phase of ['red', 'green']) {
  fs.writeFileSync(path.join(out, 'three-body-core.mjs'), phase === 'red' ? source.replace(marker, 'const scale = -G * a.mass * b.mass') : source);
  const run = spawnSync(process.execPath, ['--test', path.join(out, 'three-body-core.test.cjs')], { cwd: root, encoding: 'utf8', timeout: 120000 });
  fs.writeFileSync(path.join(out, phase + '.log'), run.stdout + run.stderr);
  console.log(phase, 'exit', run.status, (run.stdout.match(/(?:# |ℹ )(?:tests|pass|fail|skipped) .*/g) || []).join(' / '));
  if (phase === 'red') assert.ok(run.status !== 0, 'wrong force sign must fail');
  else assert.equal(run.status, 0, 'restored original must pass');
}
