const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const folder = path.join(__dirname, 'fault-injection')
fs.mkdirSync(folder, { recursive: true })
const original = fs.readFileSync(path.join(root, 'themes/fluid-particle/source/js/planet-flight.mjs'), 'utf8')
const mutant = original.replace('origin[index] - [0, 1, 8][index]', 'origin[index] + 0.4 - [0, 1, 8][index]')
if (mutant === original) throw new Error('Fault injection did not apply')
const mutantPath = path.join(folder, 'position-jump.mjs')
fs.writeFileSync(mutantPath, mutant)
for (const [label, modulePath, expectedExit] of [['red', mutantPath, 1], ['green', path.join(root, 'themes/fluid-particle/source/js/planet-flight.mjs'), 0]]) {
  const run = spawnSync(process.execPath, ['--test', 'test/planet-polish.test.cjs'], { cwd: root, encoding: 'utf8', env: { ...process.env, PLANET_POLISH_MODULE: modulePath } })
  const log = `$ PLANET_POLISH_MODULE=${modulePath} node --test test/planet-polish.test.cjs\n${run.stdout}${run.stderr}\nExit code: ${run.status}\n`
  fs.writeFileSync(path.join(folder, `${label}.log`), log)
  console.log(log)
  if (run.status !== expectedExit) throw new Error(`${label}: expected ${expectedExit}, got ${run.status}`)
}
console.log('Fault injection detected a 0.4-unit opening jump; original production module passes. Frozen tests untouched.')
