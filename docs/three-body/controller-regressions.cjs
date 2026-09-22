// Run after the normal build: node docs/three-body/controller-regressions.cjs
// Browser checks use the built app and DOM input/submit events, never mutable QA state.
// Mode continuity uses extracted production handlers + the real core, not a full DOM test.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')
const root = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const controller = read('public/js/three-body.mjs')
const scene = read('public/js/three-body-scene.mjs')
assert.equal(controller, read('themes/fluid-particle/source/js/three-body.mjs'), 'build the current controller first')
assert.equal(scene, read('themes/fluid-particle/source/js/three-body-scene.mjs'), 'build the current scene first')
const report = { startedAt: new Date().toISOString(), checks: [], mutations: [], consoleErrors: [], boundaries: 'Speed-only apply and paused cameras run in real Chromium. Mode continuity runs actual extracted event handlers with the real core and inert DOM-output stubs.' }

function modeHarness (core, source) {
  const start = source.indexOf('function advanceYears (')
  const advance = source.slice(start, source.indexOf('function tick (', start))
  const modeStart = source.indexOf("  byId('tb-mode').addEventListener('change'")
  const modeHandler = source.slice(modeStart, source.indexOf("  byId('tb-view').addEventListener", modeStart))
  assert.ok(start >= 0 && modeStart >= 0, 'production handler boundaries are present')
  // No copied physics or mortality logic: these functions come from the current production file.
  return new Function('core', `
    const { makeSystem, step, setParameters, environment, evolveCivilization, createCivilization, RULES } = core;
    let system = makeSystem('triple'), civilization = createCivilization(), paused = false, onMode;
    const saveCivilization=()=>{}, cancel=()=>{}, message=()=>{}, status=()=>{}, draw=()=>{};
    const byId=()=>({addEventListener:(event,handler)=>onMode=handler});
    ${advance}
    ${modeHandler}
    return {advanceYears, mode:value=>onMode({target:{value:String(value)}}), get system(){return system}, get civilization(){return civilization}};
  `)(core)
}

function checkMode (core, source) {
  const app = modeHarness(core, source)
  app.mode(2); app.advanceYears(1.9)
  assert.ok(app.civilization.tripleYears >= 1.89 && !app.civilization.dead)
  app.mode(1)
  app.system.bodies.slice(0, 3).forEach(body => { body.luminosity = 0 })
  app.advanceYears(0.1)
  assert.equal(core.environment(app.system).suns, 0, 'the intervening interval really has no visible suns')
  app.mode(2)
  app.system.bodies.slice(0, 3).forEach(body => { body.luminosity = 20 })
  app.advanceYears(0.11)
  assert.equal(app.system.error, null)
  assert.equal(app.civilization.dead, false, 'mode switch must break the continuous three-sun danger interval')
  assert.ok(app.civilization.tripleYears < 0.12)
  return { simTime: app.system.time, tripleYears: app.civilization.tripleYears }
}

async function browserChecks (browser, url, which = 'both') {
  const { send, evaluate, until } = browser
  const snap = () => evaluate('window.threeBodySnapshot()')
  const choose = (id, value) => evaluate(`(() => { const e=document.getElementById(${JSON.stringify(id)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('change',{bubbles:true})); })()`)
  const fill = async (id, value) => {
    await evaluate(`document.getElementById(${JSON.stringify(id)}).focus()`)
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2 })
    await send('Input.insertText', { text: String(value) })
    assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).value`), String(value))
  }
  const pause = value => evaluate(`if(window.threeBodySnapshot().paused!==${value})document.getElementById('tb-pause').click()`)
  const submit = () => evaluate("document.getElementById('tb-form').requestSubmit()")
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${url}?theme=three-body` })
  await until('typeof window.threeBodySnapshot === "function" && window.threeBodySnapshot().renderer.available && window.threeBodySnapshot().renderer.frames>0', 'real observatory rendered', 20000)
  await pause(true)
  await evaluate("document.getElementById('tb-parameters').open=true")
  await evaluate('new Promise(resolve=>requestAnimationFrame(resolve))')
  if (which !== 'camera') {
    await choose('tb-body', 'star-b')
    const stale = await snap()
    await pause(false)
    await until(`window.threeBodySnapshot().simTime > ${stale.simTime + 0.2}`, 'body moved after fields were populated', 12000)
    await pause(true)
    const before = await snap()
    assert.notDeepEqual(before.bodies[1].position, stale.bodies[1].position)
    await fill('tb-speed', 10)
    await submit()
    const after = await snap()
    assert.equal(after.speed, 10, 'the real speed input was applied')
    assert.deepEqual(after.bodies.map(body => [body.position, body.velocity]), before.bodies.map(body => [body.position, body.velocity]), 'only speed changed: no stale coordinates may be written back')
    assert.equal(after.simTime, before.simTime)
  }
  if (which !== 'speed') {
    await choose('tb-body', 'planet')
    const before = await snap()
    await fill('tb-x', 30)
    await submit()
    const moved = await snap()
    assert.equal(moved.bodies.find(body => body.id === 'planet').position[0], 30)
    assert.equal(moved.simTime, before.simTime)
    assert.notDeepEqual(moved.renderer.camera.position, before.renderer.camera.position, 'paused position edit must update the real camera immediately')
    await evaluate("document.getElementById('tb-parameters').open=false;document.getElementById('three-body-canvas').scrollIntoView({block:'center',behavior:'instant'})")
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await until('innerWidth===390 && window.threeBodySnapshot().renderer.width<450', 'paused mobile resize reached renderer')
    const resized = await snap()
    assert.equal(resized.paused, true)
    assert.equal(resized.simTime, before.simTime)
    assert.notDeepEqual(resized.renderer.camera.position, moved.renderer.camera.position, 'paused resize must reframe the real camera')
  }
}

async function main () {
  const started = performance.now()
  const core = await import(pathToFileURL(path.join(root, 'themes/fluid-particle/source/js/three-body-core.mjs')))
  report.mode = checkMode(core, controller)
  report.checks.push('Production mode handler clears interrupted continuous danger without a false death')
  const oldMode = controller.replace(/    if \(!civilization\.dead\) \{\r?\n      const history = civilization\.history[\s\S]*?\r?\n    \}/, '')
  assert.notEqual(oldMode, controller, 'mode mutation was applied to a temporary string')
  assert.throws(() => checkMode(core, oldMode), /mode switch must break/, 'the same check rejects the original mode bug')
  report.mutations.push('Removing the mode reset fails the real-core continuity check')

  const { server, url } = await serve()
  const servePublic = server.listeners('request')[0]
  let overrides = {}, browser
  server.removeListener('request', servePublic)
  server.on('request', (request, response) => {
    const pathname = new URL(request.url, url).pathname
    if (pathname in overrides) response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(overrides[pathname])
    else servePublic(request, response)
  })
  try {
    browser = await launch({ width: 1440, height: 1000 }, report)
    await browserChecks(browser, url)
    report.checks.push('Real browser speed-only form submission preserves all live positions and velocities', 'Real paused camera follows a position edit without advancing physics', 'Real paused camera reframes at 390px without advancing physics')
    const oldApply = controller.replace('dirtyFields.has(id) ? number(id) : body.position[axis]', 'number(id)').replace('dirtyFields.has(id) ? number(id) : body.velocity[axis]', 'number(id)')
    assert.notEqual(oldApply, controller, 'stale-field mutation was applied')
    overrides = { '/js/three-body.mjs': oldApply }
    await assert.rejects(() => browserChecks(browser, url, 'speed'), /only speed changed/, 'the browser check rejects the original stale-field bug')
    report.mutations.push('Serving an in-memory old apply handler fails the same browser position check')
    const oldCamera = scene.replace('!frames || options.paused ? 1 :', '!frames ? 1 :')
    assert.notEqual(oldCamera, scene, 'camera mutation was applied')
    overrides = { '/js/three-body-scene.mjs': oldCamera }
    await assert.rejects(() => browserChecks(browser, url, 'camera'), /paused position edit must update/, 'the browser check rejects the original frozen-camera bug')
    report.mutations.push('Serving an in-memory old camera branch fails the same paused-camera check')
    assert.deepEqual(report.consoleErrors, [])
    report.passed = true
  } finally {
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    report.elapsedMs = performance.now() - started
  }
}
main().catch(error => { report.passed = false; report.error = error.stack; process.exitCode = 1 }).finally(() => {
  fs.writeFileSync(path.join(__dirname, 'controller-regressions-report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
})
