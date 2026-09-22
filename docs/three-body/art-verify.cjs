// Independent, additive acceptance. Build normally first; this script never builds or edits production files.
// Run: node docs/three-body/art-verify.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const out = path.join(__dirname, 'art-evidence', runId)
const report = { startedAt: new Date().toISOString(), checks: [], stages: [], screenshots: [], consoleErrors: [], observations: {} }
const visualControls = [
  { id: 'tb-exposure', key: 'exposure', min: 0.6, max: 1.8, initial: 1.1, next: 1.6 },
  { id: 'tb-bloom', key: 'bloom', min: 0, max: 2, initial: 1, next: 1.7 },
  { id: 'tb-particles', key: 'particles', min: 0, max: 2, initial: 1, next: 2 },
  { id: 'tb-nebula', key: 'nebula', min: 0, max: 1, initial: 0.6, next: 0.9 },
  { id: 'tb-star-scale', key: 'starScale', min: 0.65, max: 1.5, initial: 1, next: 1.4 },
  { id: 'tb-trail-width', key: 'trailWidth', min: 0.5, max: 3, initial: 1.4, next: 2.6 }
]
const closeEnough = (actual, expected, label) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`)
const physics = state => ({ simTime: state.simTime, realTime: state.realTime, mode: state.mode, G: state.G, speed: state.speed, softening: state.softening, boundary: state.boundary, error: state.error, bodies: state.bodies, civilization: state.civilization })
const check = (value, label) => { assert.ok(value, label); report.checks.push(label) }

async function stage (name, run) {
  const entry = { name, startedAt: new Date().toISOString() }
  report.stages.push(entry)
  try { await run(); entry.passed = true } catch (error) { entry.passed = false; entry.error = error.stack; }
  console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${name}${entry.error ? ': ' + entry.error.split('\n')[0] : ''}`)
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
}

async function main () {
  fs.mkdirSync(out, { recursive: true })
  const start = performance.now()
  const { server, url } = await serve()
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
      const bounds = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);return{x,y,width:r.width,height:r.height,reachable:hit===e||e.contains(hit)}})()`)
      assert.ok(bounds.width > 0 && bounds.height > 0 && bounds.reachable, `${selector} must be a reachable real pointer target`)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bounds.x, y: bounds.y, button: 'left', clickCount: 1 })
      await settle()
    }
    const reveal = async id => {
      const ancestors = await evaluate(`(()=>{const list=[];for(let e=document.getElementById(${JSON.stringify(id)})?.parentElement;e;e=e.parentElement)if(e.tagName==='DETAILS')list.unshift(e.id);return list})()`)
      for (const ancestor of ancestors) if (!await evaluate(`document.getElementById(${JSON.stringify(ancestor)}).open`)) await pointerClick(`#${ancestor} > summary`)
    }
    const click = async id => { await reveal(id); await pointerClick(`#${id}`) }
    const select = async (id, value) => {
      const index = await evaluate(`[...document.getElementById(${JSON.stringify(id)}).options].findIndex(option=>option.value===${JSON.stringify(value)})`)
      assert.ok(index >= 0, `${id}: option ${value} exists`)
      await click(id); await key('Home', 'Home', 36)
      for (let i = 0; i < index; i++) await key('ArrowDown', 'ArrowDown', 40)
      await key('Enter', 'Enter', 13)
      await until(`document.getElementById(${JSON.stringify(id)}).value===${JSON.stringify(value)}`, `${id} selects ${value}`)
    }
    const pause = async value => { if ((await snap()).paused !== value) await click('tb-pause') }
    const panel = async open => {
      if (await evaluate("document.getElementById('tb-parameters').open") !== open) await pointerClick('#tb-parameters > summary')
      await settle()
    }
    const range = async (id, value) => {
      await click(id)
      const limits = await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});return{min:Number(e.min),max:Number(e.max),step:Number(e.step)}})()`)
      const right = Math.round((value - limits.min) / limits.step), left = Math.round((limits.max - value) / limits.step)
      await key(right <= left ? 'Home' : 'End', right <= left ? 'Home' : 'End', right <= left ? 36 : 35)
      for (let i = 0; i < Math.min(right, left); i++) await key(right <= left ? 'ArrowRight' : 'ArrowLeft', right <= left ? 'ArrowRight' : 'ArrowLeft', right <= left ? 39 : 37)
      closeEnough(Number(await evaluate(`document.getElementById(${JSON.stringify(id)}).value`)), value, `${id} native keyboard value`)
      await settle()
    }
    const fill = async (id, value) => {
      await click(id)
      await key('a', 'KeyA', 65, 2)
      if (value === '') await key('Backspace', 'Backspace', 8)
      else await send('Input.insertText', { text: String(value) })
      assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).value`), String(value))
    }
    const submit = () => click('tb-apply')
    const screenshot = async (label, canvasOnly = false) => {
      let clip
      if (canvasOnly) {
        await panel(false)
        await evaluate("document.getElementById('three-body-canvas').scrollIntoView({block:'center',behavior:'instant'})")
        await until('window.threeBodySnapshot().visible', 'canvas visible for screenshot')
        clip = await evaluate("(()=>{const r=document.getElementById('three-body-canvas').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,scale:1}})()")
      }
      const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip } : {}) })
      const bytes = Buffer.from(result.data, 'base64'), file = `${label}.png`
      fs.writeFileSync(path.join(out, file), bytes)
      report.screenshots.push(file)
      return createHash('sha256').update(bytes).digest('hex')
    }
    await send('Page.navigate', { url: `${url}?theme=three-body` })
    await until('typeof window.threeBodySnapshot==="function" && window.threeBodySnapshot().renderer.available && window.threeBodySnapshot().renderer.frames>0', 'built art scene rendered', 20000)
    await pause(true)

    await stage('Native controls and renderer defaults', async () => {
      const current = await snap()
      for (const c of visualControls) {
        const input = await evaluate(`(()=>{const list=document.querySelectorAll('#${c.id}'),e=list[0];return{count:list.length,type:e?.type,min:Number(e?.min),max:Number(e?.max),value:Number(e?.value)}})()`)
        assert.deepEqual(input, { count: 1, type: 'range', min: c.min, max: c.max, value: c.initial })
        closeEnough(current.visual[c.key], c.initial, c.id)
        closeEnough(current.renderer.visual[c.key], c.initial, `${c.id} renderer`)
      }
      for (const [id, min, max, value] of [['tb-softening', 0, 0.2, 0.01], ['tb-boundary', 6, 40, 12]]) {
        assert.deepEqual(await evaluate(`(()=>{const list=document.querySelectorAll('#${id}'),e=list[0];return{count:list.length,type:e?.type,min:Number(e?.min),max:Number(e?.max),value:Number(e?.value)}})()`), { count: 1, type: 'number', min, max, value })
      }
      const colors = current.renderer.visualUniforms.stars.map(star => star.tint.toLowerCase())
      check(colors.length === 3 && new Set(colors).size === 3, 'Three stellar surfaces expose three distinct actual tint uniforms')
      report.observations.starTints = colors
      check(current.renderer.particles.allocated.far === 4000 && current.renderer.particles.allocated.near === 1000 && current.renderer.particles.allocated.trailPerBody === 512, 'Particle capacity is fixed at 4000 far, 1000 near and 512 trail points per body')
      await screenshot('desktop-initial', true)
    })

    await stage('Visual input changes real rendering while physics stays frozen', async () => {
      await panel(true); await fill('tb-speed', 10); await submit(); await panel(false)
      const started = await snap()
      await pause(false)
      await until(`window.threeBodySnapshot().realTime > ${started.realTime + 0.8}`, 'real motion seeds visible trails', 15000)
      await pause(true)
      for (const c of visualControls) {
        await range(c.id, c.initial)
        const before = await snap(), beforeImage = await screenshot(`${c.key}-before`, true)
        await range(c.id, c.next)
        const after = await snap(), afterImage = await screenshot(`${c.key}-after`, true)
        closeEnough(after.visual[c.key], c.next, `${c.id} immediate state`)
        closeEnough(after.renderer.visual[c.key], c.next, `${c.id} immediate renderer`)
        assert.deepEqual(physics(after), physics(before), `${c.id} cannot move physics, age trails or change civilization`)
        const a = after.renderer.visualUniforms, b = before.renderer.visualUniforms
        if (c.key === 'exposure') closeEnough(a.exposure, c.next, 'actual renderer tone-mapping exposure')
        if (c.key === 'nebula') closeEnough(a.nebula, c.next, 'actual nebula strength uniform')
        if (c.key === 'bloom') assert.notDeepEqual(a.stars.map(star => [star.coronaStrength, star.haloOpacity]), b.stars.map(star => [star.coronaStrength, star.haloOpacity]))
        if (c.key === 'starScale') assert.notDeepEqual(a.stars.map(star => star.displayRadius), b.stars.map(star => star.displayRadius))
        if (c.key === 'trailWidth') assert.notDeepEqual(a.trails.map(trail => trail.pointSize), b.trails.map(trail => trail.pointSize))
        if (c.key === 'particles') {
          assert.equal(after.renderer.particles.drawn.far, 4000)
          assert.equal(after.renderer.particles.drawn.near, 1000)
        }
        check(afterImage !== beforeImage, `${c.id} changes canvas pixels with the parameter panel closed`)
        await range(c.id, c.initial)
      }
      await range('tb-particles', 0)
      const zero = await snap(), zeroImage = await screenshot('particles-zero', true)
      assert.equal(zero.renderer.particles.drawn.far, 0); assert.equal(zero.renderer.particles.drawn.near, 0)
      check(zero.renderer.visualUniforms.trails.every(trail => trail.gain === 0), 'Zero particle density hides luminous trail particles through real shader gain')
      await range('tb-particles', 2)
      const full = await snap(), fullImage = await screenshot('particles-full', true)
      assert.deepEqual(zero.renderer.particles.allocated, full.renderer.particles.allocated)
      assert.equal(zero.renderer.geometries, full.renderer.geometries)
      assert.equal(zero.renderer.textures, full.renderer.textures)
      check(fullImage !== zeroImage && full.renderer.particles.drawn.far === 4000 && full.renderer.particles.drawn.near === 1000, 'Density 0/2 changes actual draw ranges and pixels without allocating GPU objects')
      await range('tb-particles', 1)
    })

    await stage('Physical additions apply atomically and reject invalid input', async () => {
      await pause(true); await panel(true)
      await fill('tb-softening', 0.1); await fill('tb-boundary', 18); await submit()
      const valid = await snap()
      check(valid.softening === 0.1 && valid.boundary === 18, 'Softening and reflection boundary reach the real physical system')
      for (const [softening, boundary] of [[0.3, 8], [-0.1, 18], [0.02, 5], [0.02, 41], ['', 18]]) {
        const before = physics(await snap())
        await fill('tb-softening', softening); await fill('tb-boundary', boundary); await submit()
        assert.deepEqual(physics(await snap()), before, `Invalid softening=${softening}/boundary=${boundary} cannot partially mutate physical state`)
        check(Boolean(await evaluate("document.getElementById('tb-message').textContent.trim()")), `Invalid physical input ${softening}/${boundary} is explained`)
      }
      await fill('tb-softening', 0.01); await fill('tb-boundary', 12); await submit(); await panel(false)
    })

    await stage('Lagrange markers and belt use live physical positions with independent controls', async () => {
      await pause(true)
      let before = await snap()
      check(before.observations.lagrangeEnabled === false && before.lagrange.length === 0, 'Lagrange overlay starts disabled')
      check(before.observations.beltEnabled === true && before.belt.particles.length === 128 && before.renderer.beltCount === 128, 'Belt starts with 128 actual rendered particles')
      await click('tb-lagrange')
      const enabled = await snap()
      assert.deepEqual(physics(enabled), physics(before))
      assert.deepEqual(enabled.lagrange.map(point => point.id), ['L1', 'L2', 'L3', 'L4', 'L5'])
      assert.deepEqual(Object.keys(enabled.renderer.lagrangeProjections).sort(), ['L1', 'L2', 'L3', 'L4', 'L5'])
      check(enabled.renderer.lagrangeCount === 5 && enabled.lagrange.every(point => point.position.length === 3 && point.position.every(Number.isFinite)), 'Five finite world-space Lagrange points reach five real renderer markers')
      await select('tb-lagrange-pair', 'a-c')
      const switched = await snap()
      assert.equal(switched.observations.lagrangePair, 'a-c')
      assert.notDeepEqual(switched.lagrange.map(point => point.position), enabled.lagrange.map(point => point.position), 'Changing the primary pair recomputes L1-L5 from current bodies')
      assert.deepEqual(physics(switched), physics(before))
      await screenshot('lagrange-and-belt', true)
      before = await snap()
      await click('tb-belt')
      assert.equal((await snap()).renderer.beltCount, 0)
      await click('tb-belt')
      assert.equal((await snap()).renderer.beltCount, 128)
      assert.deepEqual(physics(await snap()), physics(before))
      await panel(true)
      for (const [id, value] of [['tb-belt-count', 96], ['tb-belt-inner', 18], ['tb-belt-outer', 28], ['tb-belt-inclination', 23]]) await fill(id, value)
      await click('tb-belt-apply')
      const rebuilt = await snap()
      check(rebuilt.belt.particles.length === 96 && rebuilt.renderer.beltCount === 96 && rebuilt.belt.error === null, 'Belt parameters atomically rebuild 96 actual simulation and rendered particles')
      assert.deepEqual(physics(rebuilt), physics(before), 'Rebuilding the belt must not reset, advance or change the four core bodies')
      for (const [inner, outer] of [[40, 20], [18, 18]]) {
        await fill('tb-belt-inner', inner); await fill('tb-belt-outer', outer); await click('tb-belt-apply')
        const rejected = await snap()
        assert.deepEqual(rejected.belt.particles, rebuilt.belt.particles)
        assert.deepEqual(rejected.observations.beltSettings, rebuilt.observations.beltSettings)
        assert.deepEqual(physics(rejected), physics(rebuilt))
      }
      report.checks.push('Belt inner >= outer is rejected without changing its particles, settings or the core system')
      await fill('tb-belt-inner', 18); await fill('tb-belt-outer', 28); await panel(false)
      const frozen = await snap()
      await new Promise(resolve => setTimeout(resolve, 200))
      assert.deepEqual((await snap()).belt.particles, frozen.belt.particles, 'Paused belt positions remain frozen')
      await pause(false)
      await until(`window.threeBodySnapshot().simTime>${frozen.simTime + 0.2}`, 'real solver advances belt observation', 15000)
      await pause(true)
      const moving = await snap()
      check(moving.belt.particles.every((particle, i) => JSON.stringify(particle.position) !== JSON.stringify(frozen.belt.particles[i].position)), 'All belt particles advance from their live positions when the simulation runs')
      check(JSON.stringify(moving.lagrange) !== JSON.stringify(frozen.lagrange), 'Lagrange marker coordinates update as the source pair really moves')
      report.observations.belt = { count: moving.belt.particles.length, error: moving.belt.error, capacity: moving.renderer.beltCapacity }
    })

    await stage('Art controls cannot revive a destroyed civilization', async () => {
      await panel(false); await select('tb-mode', '2'); await select('tb-preset', 'triple')
      await pause(false)
      await until('window.threeBodySnapshot().civilization.dead', 'actual three-sun civilization death', 15000)
      await pause(true)
      const dead = physics(await snap())
      for (const c of visualControls) await range(c.id, c.next)
      assert.deepEqual(physics(await snap()), dead)
      check((await snap()).civilization.dead, 'All six art sliders preserve the actual latched death, event history and physical state')
      for (const c of visualControls) await range(c.id, c.initial)
    })

    await stage('390px and 200% text retain a scrollable reachable panel', async () => {
      await pause(true)
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
      await panel(true)
      for (const percentage of [100, 200]) {
        await evaluate(`document.documentElement.style.fontSize='${percentage}%'`)
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        const layout = await evaluate(`(()=>{const p=document.getElementById('tb-parameters'),r=p.getBoundingClientRect();return{width:innerWidth,client:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,body:document.body.scrollWidth,panel:{left:r.left,right:r.right,client:p.clientHeight,scroll:p.scrollHeight,overflow:getComputedStyle(p).overflowY}}})()`)
        check(layout.width === 390 && layout.page <= layout.client && layout.body <= layout.client, `390px at ${percentage}% text has no document horizontal overflow`)
        check(layout.panel.left >= 0 && layout.panel.right <= layout.client + 1 && layout.panel.scroll > layout.panel.client && ['auto', 'scroll'].includes(layout.panel.overflow), `Parameter panel at ${percentage}% stays in bounds and scrolls vertically`)
        for (const id of ['tb-exposure', 'tb-trail-width', 'tb-softening', 'tb-boundary', 'tb-belt-apply', 'tb-apply']) {
          await reveal(id)
          const reachable = await evaluate(`(()=>{const e=document.getElementById('${id}');e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=e.getBoundingClientRect(),p=document.getElementById('tb-parameters').getBoundingClientRect(),x=Math.max(r.left+2,Math.min(r.right-2,innerWidth/2)),y=(Math.max(r.top,p.top)+Math.min(r.bottom,p.bottom))/2;const hit=document.elementFromPoint(x,y);return r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&y>=0&&y<innerHeight&&(hit===e||e.contains(hit));})()`)
          check(reachable, `${id} remains reachable inside the ${percentage}% mobile scrolling panel`)
        }
        await screenshot(`mobile-panel-${percentage}`)
      }
      await evaluate("document.documentElement.style.fontSize='100%'")
      await panel(false); await screenshot('mobile-scene', true)
    })
    check(report.consoleErrors.length === 0, 'No browser console/runtime errors occurred during art and observation controls')
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
