const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const { launch } = require('../../tools/verify-planet-explorer.cjs')
const base = 'https://quarkbobo.github.io/'
const commit = '8bcfe93730a40d2b36c51a76780a9288fc5ab890'
const report = { base, commit, checkedAt: new Date().toISOString(), assets: [], consoleErrors: [] }
const sha = value => createHash('sha256').update(value).digest('hex')

;(async () => {
  for (const file of ['js/three-body.mjs', 'js/three-body-core.mjs', 'js/three-body-scene.mjs', 'js/three-body-overlays.mjs', 'js/three-body-events.mjs', 'css/three-body.css']) {
    const response = await fetch(base + file, { signal: AbortSignal.timeout(20000) })
    assert.equal(response.status, 200, file)
    const mime = response.headers.get('content-type')
    assert.match(mime, file.endsWith('.css') ? /text\/css/ : /javascript/, file)
    const body = Buffer.from(await response.arrayBuffer())
    const source = execFileSync('git', ['show', `${commit}:themes/fluid-particle/source/${file}`])
    assert.equal(sha(body), sha(source), `${file}: deployed bytes match release commit`)
    report.assets.push({ file, status: response.status, mime, sha256: sha(body) })
  }
  for (const route of ['', 'archives/', 'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js']) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(20000) })
    assert.equal(response.status, 200, route || 'home')
    assert.match(response.headers.get('content-type'), route.endsWith('.js') ? /javascript/ : /text\/html/)
    report.assets.push({ file: route || '/', status: response.status, mime: response.headers.get('content-type') })
  }
  const browser = await launch({ width: 1440, height: 900 }, report)
  try {
    await browser.send('Page.navigate', { url: base + '?theme=three-body' })
    await browser.until('window.threeBodySnapshot?.().renderer.available', 'published WebGL scene', 30000)
    await browser.until('window.threeBodySnapshot().realTime >= 3', 'published simulation advances', 20000)
    const initial = await browser.evaluate('threeBodySnapshot()')
    assert.equal(initial.active, true)
    assert.equal(initial.renderer.bodyCount, 4)
    assert.equal(initial.error, null)
    assert.ok(initial.simTime > 0)
    await browser.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    await browser.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    assert.ok(await browser.evaluate('document.activeElement !== document.body'), 'keyboard navigation works')
    const screenshot = await browser.send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(path.join(__dirname, 'published-1440.png'), Buffer.from(screenshot.data, 'base64'))
    report.state = { active: initial.active, bodyCount: initial.renderer.bodyCount, frames: initial.renderer.frames, simTime: initial.simTime, realTime: initial.realTime, beltCount: initial.renderer.beltCount, error: initial.error }
    assert.deepEqual(report.consoleErrors, [])
    report.passed = true
    console.log(JSON.stringify(report, null, 2))
  } finally { await browser.close() }
})().catch(error => { report.passed = false; report.error = String(error.stack); console.error(error); process.exitCode = 1 }).finally(() => {
  fs.writeFileSync(path.join(__dirname, 'publish-verification.json'), JSON.stringify(report, null, 2) + '\n')
})
