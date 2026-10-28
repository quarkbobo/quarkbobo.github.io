const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
process.chdir(root)
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const allowed = ['themes/fluid-particle/source/js/planet-explorer.mjs', 'themes/fluid-particle/source/js/planet-flight.mjs', 'themes/fluid-particle/source/css/planet-explorer.css']
const mode = process.argv[2]
if (mode === 'snapshot') {
  fs.mkdirSync(path.join(__dirname, 'baseline'), { recursive: true })
  const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/).filter(f => fs.existsSync(f) && !f.startsWith('docs/transition-polish/'))
  const manifest = Object.fromEntries(files.map(f => [f, hash(f)]))
  manifest['.superpowers/leader-motion-baseline.cjs'] = hash('.superpowers/leader-motion-baseline.cjs')
  fs.writeFileSync(path.join(__dirname, 'baseline/hashes.json'), JSON.stringify(manifest, null, 2))
  for (const file of allowed) fs.copyFileSync(file, path.join(__dirname, 'baseline', path.basename(file)))
  console.log(`Recorded ${Object.keys(manifest).length} file hashes and three exact source backups.`)
} else if (mode === 'verify-scope') {
  const manifest = require('./baseline/hashes.json')
  const changed = Object.keys(manifest).filter(file => !fs.existsSync(file) || hash(file) !== manifest[file])
  const unexpected = changed.filter(file => !allowed.includes(file) && !['PROGRESS.md', 'BLOCKED.md'].includes(file))
  const current = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
  const index = Object.fromEntries(spawnSync('git', ['ls-files', '-s', '-z'], { encoding: 'utf8' }).stdout.split('\0').filter(Boolean).map(line => { const [metadata, file] = line.split('\t'); return [file, metadata.split(' ')[1]] }))
  const outsideSnapshot = current.filter(f => !(f in manifest) && !f.startsWith('docs/transition-polish/') && !['PROGRESS.md', 'BLOCKED.md', 'test/planet-polish.test.cjs'].includes(f))
  // Initial git enumeration quoted non-ASCII tracked names. They were not
  // modified before this task; independently compare them to the git index.
  const indexChecks = outsideSnapshot.map(file => ({ file, indexHash: index[file] || null, workingHash: spawnSync('git', ['hash-object', '--', file], { encoding: 'utf8' }).stdout.trim() }))
  const unexpectedNew = indexChecks.filter(item => !item.indexHash || item.indexHash !== item.workingHash).map(item => item.file)
  fs.writeFileSync(path.join(__dirname, 'tracked-index-checks.json'), JSON.stringify(indexChecks, null, 2))
  console.log(JSON.stringify({ changed, unexpected, unexpectedNew, trackedIndexChecks: indexChecks.length, frozen: Object.keys(manifest).filter(f => f.startsWith('test/') || f.startsWith('tools/verify-planet-') || f === '.superpowers/leader-motion-baseline.cjs').length }, null, 2))
  if (unexpected.length || unexpectedNew.length) process.exitCode = 1
} else {
  const [folder, label, command, ...args] = process.argv.slice(2)
  fs.mkdirSync(path.join(__dirname, folder), { recursive: true })
  const result = spawnSync(command === 'npm' ? process.execPath : command, command === 'npm' ? [path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args] : args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const output = `$ ${command} ${args.join(' ')}\n${result.stdout || ''}${result.stderr || ''}\nExit code: ${result.status}\n`
  fs.writeFileSync(path.join(__dirname, folder, `${label}.log`), output)
  console.log(output.split('\n').slice(-24).join('\n'))
  if (result.error) console.error(result.error)
  process.exitCode = result.status ?? 1
}
