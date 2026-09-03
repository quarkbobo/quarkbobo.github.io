const test = require('node:test')
const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const scriptPath = path.join(root, 'tools', 'bobo-update.ps1')
const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'

function run (command, args, options = {}) {
  return childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    ...options
  })
}

function git (cwd, ...args) {
  const result = run('git', ['-C', cwd, ...args])
  assert.equal(result.status, 0, result.stderr || result.stdout)
  return result.stdout.trim()
}

function requirePowerShell (t) {
  const result = run(powershell, ['-NoProfile', '-Command', 'exit 0'])
  if (result.error || result.status !== 0) {
    t.skip(`${powershell} is unavailable`)
    return false
  }
  return true
}

function write (filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, contents, 'utf8')
}

function createFixture (t) {
  assert.ok(fs.existsSync(scriptPath), 'tools/bobo-update.ps1 must exist')
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bobo-updater-'))
  const remote = path.join(fixtureRoot, 'remote.git')
  const repo = path.join(fixtureRoot, 'repo')
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))

  assert.equal(run('git', ['init', '--bare', remote]).status, 0)
  assert.equal(run('git', ['init', '-b', 'master', repo]).status, 0)
  git(repo, 'config', 'user.name', 'Bobo Updater Test')
  git(repo, 'config', 'user.email', 'bobo-updater@example.invalid')

  write(path.join(repo, 'source', '_posts', '个人博客', 'hello.md'), `---
title: 你好，Bobo
permalink: /hello-bobo/
---

正文
`)
  write(path.join(repo, 'source', '_posts', '技术教程', 'guide.html'), '<!doctype html><title>测试指南</title><p>guide</p>')
  fs.mkdirSync(path.join(repo, 'tools'), { recursive: true })
  fs.copyFileSync(scriptPath, path.join(repo, 'tools', 'bobo-update.ps1'))
  git(repo, 'add', '-A')
  git(repo, 'commit', '-m', 'seed')
  git(repo, 'remote', 'add', 'origin', remote)
  git(repo, 'push', '-u', 'origin', 'master')

  return { remote, repo, copiedScript: path.join(repo, 'tools', 'bobo-update.ps1') }
}

function runUpdater (fixture, extraArgs = []) {
  return run(powershell, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', fixture.copiedScript,
    '-RepositoryPath', fixture.repo,
    ...extraArgs
  ])
}

test('Bobo updater generates the catalogue, commits pending work, and pushes master', t => {
  if (!requirePowerShell(t)) return
  const fixture = createFixture(t)
  write(path.join(fixture.repo, 'source', '_posts', '游戏相关', 'game.md'), `---
title: 游戏记录
permalink: /game-log/
---
`)

  const result = runUpdater(fixture, ['-SuccessDelaySeconds', '0', '-NonInteractive'])

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const catalogue = fs.readFileSync(path.join(fixture.repo, 'source', '_posts', '博客目录.md'), 'utf8')
  assert.match(catalogue, /### 个人博客[\s\S]*\[你好，Bobo\]\(\/hello-bobo\/\)/)
  assert.match(catalogue, /### 技术教程[\s\S]*\[测试指南\]\(技术教程\/guide\) \(HTML\)/)
  assert.match(catalogue, /### 游戏相关[\s\S]*\[游戏记录\]\(\/game-log\/\)/)
  assert.equal(git(fixture.remote, 'rev-list', '--count', 'master'), '2')
  assert.equal(git(fixture.remote, 'show', 'master:source/_posts/博客目录.md').includes('你好，Bobo'), true)
})

test('a successful no-change run keeps one commit and exits after the default one-second delay', t => {
  if (!requirePowerShell(t)) return
  const fixture = createFixture(t)
  const first = runUpdater(fixture, ['-SuccessDelaySeconds', '0', '-NonInteractive'])
  assert.equal(first.status, 0, first.stderr || first.stdout)
  const commitsBefore = git(fixture.repo, 'rev-list', '--count', 'HEAD')

  const started = Date.now()
  const second = runUpdater(fixture, ['-NonInteractive'])
  const elapsed = Date.now() - started

  assert.equal(second.status, 0, second.stderr || second.stdout)
  assert.equal(git(fixture.repo, 'rev-list', '--count', 'HEAD'), commitsBefore)
  assert.ok(elapsed >= 900, `default success delay was only ${elapsed}ms`)
  assert.ok(elapsed < 5000, `successful updater did not close promptly (${elapsed}ms)`)
})

test('a non-master branch is rejected without changing the remote', t => {
  if (!requirePowerShell(t)) return
  const fixture = createFixture(t)
  git(fixture.repo, 'switch', '-c', 'feature')
  const before = git(fixture.remote, 'rev-parse', 'master')

  const result = runUpdater(fixture, ['-SuccessDelaySeconds', '0', '-NonInteractive'])

  assert.notEqual(result.status, 0)
  assert.equal(git(fixture.remote, 'rev-parse', 'master'), before)
  assert.equal(git(fixture.repo, 'branch', '--show-current'), 'feature')
})

test('an interactive failure keeps the window process alive until Enter is supplied', async t => {
  if (!requirePowerShell(t)) return
  const fixture = createFixture(t)
  git(fixture.repo, 'switch', '-c', 'feature')

  const child = childProcess.spawn(powershell, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', fixture.copiedScript,
    '-RepositoryPath', fixture.repo,
    '-SuccessDelaySeconds', '0'
  ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
  t.after(() => { if (child.exitCode == null) child.kill() })

  await new Promise(resolve => setTimeout(resolve, 500))
  assert.equal(child.exitCode, null, 'failure should wait for user acknowledgement')
  child.stdin.write('\r\n')
  child.stdin.end()
  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  assert.equal(exitCode, 1)
})

test('the updater source contains no destructive or account-changing Git operations', () => {
  assert.ok(fs.existsSync(scriptPath), 'tools/bobo-update.ps1 must exist')
  const source = fs.readFileSync(scriptPath, 'utf8')
  assert.doesNotMatch(source, /--force|reset\s+--hard|remote\s+(?:add|set-url)|config\s+credential/i)
})
