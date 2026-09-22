// Additive, real-browser acceptance. Run after a normal build; never builds or changes production.
// Inputs use native CDP pointer/keyboard events; snapshots and renderer diagnostics are read-only.
// Run: node docs/three-body/events-verify.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')
const out = path.join(__dirname, 'events-evidence', new Date().toISOString().replace(/[:.]/g, '-'))
const report = { startedAt: new Date().toISOString(), checks: [], stages: [], screenshots: [], consoleErrors: [], observations: {} }
// Round-one evidence is retained in events-evidence/2026-09-22T09-49-16-578Z.
// Its only failures used nonexistent select value "follow"; actual production option is "planet".
// Round two changes these two fixture values only; rendering/physics assertions are unchanged.
report.fixtureCorrections = [{ previousRun: '2026-09-22T09-49-16-578Z', cause: 'Nonexistent tb-view option follow', correction: 'Use actual native option planet at both follow-view checks' }]
const closeEnough = (a, b, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-8, `${label}: ${a} != ${b}`)
const check = (value, label) => { assert.ok(value, label); report.checks.push(label) }
const physics = s => ({ simTime: s.simTime, realTime: s.realTime, mode: s.mode, G: s.G, speed: s.speed, softening: s.softening, boundary: s.boundary, bodies: s.bodies, civilization: s.civilization, error: s.error })
const zeroEffects = e => e.flare.strength === 0 && e.dust === 0 && e.aurora === 0
const strength = (s, type) => type === 'flare' ? s.effects.flare.strength : s.effects[type]
const distance = s => Math.hypot(...s.renderer.camera.position.map((v, i) => v - s.renderer.target[i]))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function stage (name, run) {
  const entry = { name, startedAt: new Date().toISOString() }
  report.stages.push(entry)
  try { await run(); entry.passed = true } catch (error) { entry.passed = false; entry.error = error.stack }
  console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${name}${entry.error ? ': ' + entry.error.split('\n')[0] : ''}`)
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
}
async function main () {
  fs.mkdirSync(out, { recursive: true })
  const start = performance.now(), { server, url } = await serve()
  let browser
  try {
    browser = await launch({ width: 1440, height: 1000 }, report)
    const { send, evaluate, until } = browser
    const snap = () => evaluate('window.threeBodySnapshot()')
    const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    const key = async (key, code, windowsVirtualKeyCode, modifiers = 0) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers })
    }
    const pointerClick = async selector => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`)
      await settle()
      const r = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{x,y,width:r.width,height:r.height,reachable:h===e||e.contains(h)}})()`)
      assert.ok(r.width > 0 && r.height > 0 && r.reachable, `${selector} is a reachable pointer target`)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 })
      await settle()
    }
    const reveal = async id => {
      const ancestors = await evaluate(`(()=>{const a=[];for(let e=document.getElementById(${JSON.stringify(id)})?.parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS')a.unshift(e.id);return a})()`)
      for (const ancestor of ancestors) if (!await evaluate(`document.getElementById(${JSON.stringify(ancestor)}).open`)) await pointerClick(`#${ancestor} > summary`)
    }
    const click = async id => { await reveal(id); await pointerClick(`#${id}`) }
    const select = async (id, value) => {
      const index = await evaluate(`[...document.getElementById(${JSON.stringify(id)}).options].findIndex(o=>o.value===${JSON.stringify(value)})`)
      assert.ok(index >= 0, `${id} option exists`)
      await click(id); await key('Home', 'Home', 36)
      for (let i = 0; i < index; i++) await key('ArrowDown', 'ArrowDown', 40)
      await key('Enter', 'Enter', 13)
      await until(`document.getElementById(${JSON.stringify(id)}).value===${JSON.stringify(value)}`, `${id} native select`)
    }
    const pause = async value => { if ((await snap()).paused !== value) await click('tb-pause') }
    const panel = async open => { if (await evaluate("document.getElementById('tb-parameters').open") !== open) await pointerClick('#tb-parameters > summary'); await settle() }
    const checkbox = async (id, value) => { if (await evaluate(`document.getElementById(${JSON.stringify(id)}).checked`) !== value) await click(id) }
    const range = async (id, value) => {
      await click(id)
      const limits = await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});return{min:Number(e.min),max:Number(e.max),step:Number(e.step)}})()`)
      const right = Math.round((value - limits.min) / limits.step), left = Math.round((limits.max - value) / limits.step)
      await key(right <= left ? 'Home' : 'End', right <= left ? 'Home' : 'End', right <= left ? 36 : 35)
      for (let i = 0; i < Math.min(right, left); i++) await key(right <= left ? 'ArrowRight' : 'ArrowLeft', right <= left ? 'ArrowRight' : 'ArrowLeft', right <= left ? 39 : 37)
      closeEnough(Number(await evaluate(`document.getElementById(${JSON.stringify(id)}).value`)), value, `${id} native value`)
      await settle()
    }
    const screenshot = async label => {
      await panel(false)
      await evaluate("document.getElementById('three-body-canvas').scrollIntoView({block:'center',behavior:'instant'})")
      await until('window.threeBodySnapshot().visible', 'canvas visible')
      const clip = await evaluate("(()=>{const r=document.getElementById('three-body-canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()")
      const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip })
      const bytes = Buffer.from(image.data, 'base64'), file = `${label}.png`
      fs.writeFileSync(path.join(out, file), bytes); report.screenshots.push(file)
      return createHash('sha256').update(bytes).digest('hex')
    }
    const realUniforms = (s, type, expected) => {
      assert.deepEqual(s.renderer.effects, s.effects, `${type}: effect packet reaches renderer`)
      const uniforms = s.renderer.effectUniforms
      if (type === 'flare') {
        const star = uniforms.stars.find(star => star.id === s.events.active.starId)
        closeEnough(star.flareStrength, expected, 'actual flare strength uniform')
        if (expected > 0) assert.ok(star.flareOpacity > 0, 'actual flare material visible')
        assert.ok(uniforms.stars.filter(star => star.id !== s.events.active.starId).every(star => star.flareStrength === 0), 'only selected star flares')
      } else if (type === 'dust') {
        closeEnough(uniforms.dustStrength, expected * 0.8, 'actual dust gain uniform (documented 0.8 material gain)')
        assert.equal(s.renderer.dustParticles.active, Math.floor(192 * expected / 2))
      } else {
        closeEnough(uniforms.planetAurora, expected, 'actual planet aurora uniform')
        closeEnough(uniforms.atmosphereAurora, expected, 'actual atmosphere aurora uniform')
      }
    }
    await send('Page.navigate', { url: `${url}?theme=three-body` })
    await until('typeof window.threeBodySnapshot==="function" && window.threeBodySnapshot().renderer.available && window.threeBodySnapshot().renderer.frames>0', 'built event scene rendered', 20000)
    await pause(true)

    await stage('Event native controls, clock and fixed renderer resources', async () => {
      const s = await snap()
      assert.deepEqual(s.eventSettings, { enabled: true, frequency: 1, intensity: 1 })
      assert.equal(await evaluate("document.getElementById('tb-event-tools').open"), false)
      for (const [id, min, max, step, value] of [['tb-event-frequency', 0.25, 3, 0.25, 1], ['tb-event-intensity', 0, 2, 0.1, 1]]) {
        assert.deepEqual(await evaluate(`(()=>{const e=document.getElementById('${id}');return{type:e.type,min:+e.min,max:+e.max,step:+e.step,value:+e.value}})()`), { type: 'range', min, max, step, value })
      }
      check(s.events.active === null && s.events.history.length === 0 && s.events.nextAt >= 8 && s.events.nextAt <= 14, 'First event is scheduled 8–14 foreground seconds from initial time zero')
      check(s.renderer.dustParticles.allocated === 192 && s.renderer.dustParticles.active === 0 && s.renderer.dustParticles.space === 'world' && s.renderer.dustParticles.decorative, 'Dust is a fixed pool of 192 decorative world-space particles')
      report.observations.initial = { nextAt: s.events.nextAt, realTime: s.realTime, geometries: s.renderer.geometries, textures: s.renderer.textures }
    })

    for (const type of ['flare', 'dust', 'aurora']) await stage(`Manual ${type}: envelope, real uniforms and paused pixel changes`, async () => {
      await pause(true); await checkbox('tb-events-enabled', true); await range('tb-event-intensity', 1)
      await select('tb-event-type', type)
      const before = await snap()
      await click('tb-event-trigger')
      const queued = await snap()
      assert.deepEqual(physics(queued), physics(before), 'queueing is visual-only')
      assert.equal(queued.events.active.type, type)
      closeEnough(queued.events.active.startedAt, queued.realTime, 'queued event starts at current foreground clock')
      assert.equal(queued.events.history.length, before.events.history.length + 1)
      check(zeroEffects(queued.effects), `${type}: paused age-zero event is queued without displaying a false envelope`)
      await delay(250)
      assert.deepEqual((await snap()).events, queued.events, 'paused event age and history remain frozen')
      await panel(false); await pause(false)
      await until(`(()=>{const s=window.threeBodySnapshot();return ${type === 'flare' ? 's.effects.flare.strength' : `s.effects.${type}`}>0.45})()`, `${type} visibly develops on actual foreground time`, 8000)
      await pause(true)
      const active = await snap(), one = strength(active, type)
      check(active.events.active.id === queued.events.active.id && active.events.history.length === queued.events.history.length, `${type}: continuous event advancement records exactly once`)
      realUniforms(active, type, one)
      const imageOne = await screenshot(`${type}-intensity-one`)
      await range('tb-event-intensity', 0)
      const zero = await snap(), imageZero = await screenshot(`${type}-intensity-zero`)
      assert.deepEqual(physics(zero), physics(active))
      realUniforms(zero, type, 0)
      check(zeroEffects(zero.effects) && imageZero !== imageOne, `${type}: intensity zero changes real canvas pixels and all effect uniforms without moving physics`)
      await range('tb-event-intensity', 2)
      const two = await snap(), imageTwo = await screenshot(`${type}-intensity-two`)
      assert.deepEqual(physics(two), physics(active))
      closeEnough(strength(two, type), one * 2, `${type}: intensity doubles the same paused envelope`)
      realUniforms(two, type, one * 2)
      check(imageTwo !== imageZero, `${type}: intensity two visibly restores the actual effect`)
      assert.equal(two.renderer.dustParticles.allocated, 192)
      assert.equal(two.renderer.geometries, active.renderer.geometries)
      assert.equal(two.renderer.textures, active.renderer.textures)
      if (type === 'dust') {
        assert.ok(two.renderer.dustParticles.active > 0 && two.renderer.dustParticles.sample.every(Number.isFinite))
        await select('tb-view', 'planet')
        const follow = await snap()
        assert.deepEqual(follow.renderer.dustParticles.sample, two.renderer.dustParticles.sample, 'dust world positions do not follow camera')
        assert.deepEqual(physics(follow), physics(two))
        await select('tb-view', 'station')
        check(true, 'Dust world coordinates stay fixed when camera changes at the same event clock')
      }
      report.observations[type] = { event: active.events.active, strengthOne: one, strengthTwo: strength(two, type), actualUniforms: two.renderer.effectUniforms, dustParticles: two.renderer.dustParticles, images: { one: imageOne, zero: imageZero, two: imageTwo } }
    })

    await stage('Disable, frequency, hidden theme and first automatic event', async () => {
      await pause(true)
      const before = await snap()
      await checkbox('tb-events-enabled', false)
      const disabled = await snap()
      assert.deepEqual(physics(disabled), physics(before))
      assert.deepEqual(disabled.events.history, before.events.history)
      check(disabled.events.active === null && disabled.events.nextAt === null && zeroEffects(disabled.effects) && zeroEffects(disabled.renderer.effects) && disabled.renderer.dustParticles.active === 0, 'Disable immediately clears active effects and scheduled time while retaining history')
      await checkbox('tb-events-enabled', true); await range('tb-event-intensity', 1)
      await click('tb-reset'); await range('tb-event-frequency', 1)
      let s = await snap(), wait = s.events.nextAt - s.realTime
      check(s.events.active === null && s.events.history.length === 0 && wait >= 8 && wait <= 14, 'Reset clears event state and frequency one schedules the documented interval')
      const beforeFrequency = physics(s)
      await range('tb-event-frequency', 3)
      s = await snap(); wait = s.events.nextAt - s.realTime
      assert.deepEqual(physics(s), beforeFrequency)
      check(wait >= 8 / 3 && wait <= 14 / 3, 'Frequency three schedules first automatic event in 8/3–14/3 foreground seconds')
      await panel(false); await pause(false); await click('three-body-toggle')
      const hidden = await snap()
      assert.equal(hidden.active, false)
      // Wait longer than the scheduled first-event interval. Hidden wall time must not count.
      await delay(5200)
      const hiddenLater = await snap()
      assert.deepEqual(physics(hiddenLater), physics(hidden))
      assert.deepEqual(hiddenLater.events, hidden.events)
      check(hiddenLater.events.history.length === 0, 'Theme hiding freezes the event clock across a whole first-event wait without catch-up events')
      await click('three-body-toggle'); await pause(true)
      const restored = await snap()
      assert.equal(restored.events.history.length, 0)
      assert.equal(restored.events.nextAt, hidden.events.nextAt)
      const scheduled = restored.events.nextAt
      await pause(false)
      await until('window.threeBodySnapshot().events.history.length===1', 'real automatic event fires', 10000)
      await pause(true)
      const automatic = await snap()
      check(automatic.events.active && automatic.events.active.startedAt >= scheduled && automatic.events.active.startedAt <= scheduled + 0.5, 'First automatic event starts on the scheduled foreground clock')
      const event = automatic.events.active
      assert.equal(automatic.events.history.filter(record => record.id === event.id).length, 1)
      await delay(500)
      const frozen = await snap()
      assert.deepEqual(frozen.events, automatic.events)
      assert.deepEqual(physics(frozen), physics(automatic))
      check(true, 'Automatic event records once and pause freezes active progress, scheduling and physics')
      report.observations.automatic = { scheduled, event, hiddenClock: hidden.realTime, restoredClock: restored.realTime, history: automatic.events.history }
      await click('tb-reset')
      const reset = await snap()
      check(reset.events.active === null && reset.events.history.length === 0 && zeroEffects(reset.effects) && zeroEffects(reset.renderer.effects), 'Reset removes an active automatic event and starts a clean event history')
    })

    await stage('Event controls preserve an actual latched civilization death', async () => {
      await pause(true); await panel(false); await select('tb-mode', '2'); await select('tb-preset', 'triple')
      await pause(false)
      await until('window.threeBodySnapshot().civilization.dead', 'actual three-sun death before visual controls', 15000)
      await pause(true)
      const dead = physics(await snap())
      await select('tb-event-type', 'aurora'); await click('tb-event-trigger')
      await range('tb-event-intensity', 2); await range('tb-event-frequency', 0.25)
      await checkbox('tb-events-enabled', false); await checkbox('tb-events-enabled', true)
      assert.deepEqual(physics(await snap()), dead)
      check((await snap()).civilization.dead, 'Triggering, changing strength/frequency and toggling events preserve physical bodies and the latched civilization death')
    })

    await stage('Paused overview keyboard zoom and complete belt framing', async () => {
      await pause(true); await panel(false); await select('tb-mode', '1'); await select('tb-preset', 'balanced'); await select('tb-view', 'station')
      await checkbox('tb-belt', true); await checkbox('tb-belt-fit', false); await panel(false)
      await click('three-body-canvas')
      const original = await snap()
      await key('+', 'Equal', 187, 8); await settle()
      const plus = await snap()
      check(distance(plus) < distance(original), 'Actual plus key zooms in by reducing camera-to-target distance')
      assert.deepEqual(physics(plus), physics(original))
      await key('-', 'Minus', 189); await settle()
      const minus = await snap()
      closeEnough(distance(minus), distance(original), 'minus restores camera distance')
      assert.deepEqual(physics(minus), physics(original))
      const baseline = await snap()
      await checkbox('tb-belt-fit', true)
      const fitted = await snap()
      assert.deepEqual(physics(fitted), physics(baseline))
      assert.deepEqual(fitted.belt.particles, baseline.belt.particles)
      check(fitted.observations.fitBelt && fitted.renderer.fitBelt && fitted.renderer.beltIncludedInFit && distance(fitted) > distance(baseline), 'Include-belt framing expands the real station camera without moving any physical or belt particles')
      check(Object.values(fitted.renderer.projections).every(point => point.visible) && fitted.renderer.beltCount === 128, 'All four physical bodies remain visible alongside the full rendered belt')
      await screenshot('desktop-complete-belt')
      await checkbox('tb-belt-fit', false)
      const off = await snap()
      assert.deepEqual(off.renderer.camera, baseline.renderer.camera, 'turning off belt framing restores the station camera')
      assert.deepEqual(physics(off), physics(baseline))
      await select('tb-view', 'planet')
      const follow = await snap()
      await checkbox('tb-belt-fit', true)
      const followFit = await snap()
      assert.deepEqual(followFit.renderer.camera, follow.renderer.camera)
      check(followFit.renderer.fitBelt && !followFit.renderer.beltIncludedInFit, 'Include-belt option leaves follow camera unchanged')
      await select('tb-view', 'station')
      await screenshot('final-complete-belt')
      report.observations.framing = { originalDistance: distance(original), plusDistance: distance(plus), restoredDistance: distance(minus), fittedDistance: distance(fitted), camera: fitted.renderer.camera, bodies: fitted.renderer.projections }
    })
    check(report.consoleErrors.length === 0, 'No browser console/runtime errors throughout real event and belt-framing operations')
    report.passed = report.stages.every(entry => entry.passed)
  } finally {
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    report.elapsedMs = performance.now() - start
  }
}
main().catch(error => { report.passed = false; report.error = error.stack }).finally(() => {
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, stages: report.stages.map(({ name, passed }) => ({ name, passed })), elapsedMs: report.elapsedMs, report: path.join(out, 'report.json'), error: report.error }, null, 2))
  if (!report.passed) process.exitCode = 1
})
