// Single-theme acceptance: native browser input, real production solver/renderer, no build or mocks.
// Run after a normal build: node docs/three-body/only-theme-verify.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')
const out = path.join(__dirname, 'only-theme-evidence', new Date().toISOString().replace(/[:.]/g, '-'))
const report = { startedAt: new Date().toISOString(), stages: [], checks: [], consoleErrors: [], screenshots: [] }
// The original red run used 1440x1000. Corrected to the requested 1440x900 before green;
// that failing evidence remains in only-theme-evidence/2026-09-22T10-40-18-054Z.
report.fixtureCorrections = [{ previousRun: '2026-09-22T10-40-18-054Z', correction: 'Desktop height 1000 -> requested 900; all existing assertions unchanged' }]
report.fixtureCorrections.push({ previousRun: '2026-09-22T10-42-25-949Z', cause: 'The unchanged first article has 565 characters and zero body anchors; requiring an authored body link was invalid.', correction: 'Retain readable body and archive-entry assertions; verify actual article header links by native clicks to archive and home.' })
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const check = (condition, label) => { assert.ok(condition, label); report.checks.push(label) }
const motion = s => ({ simTime: s.simTime, realTime: s.realTime, bodies: s.bodies, civilization: s.civilization, events: s.events, frames: s.renderer.frames })
async function main () {
  fs.mkdirSync(out, { recursive: true })
  const start = performance.now(), { server, url } = await serve()
  try {
    for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
      const browser = await launch(viewport, report)
      const { send, evaluate, until } = browser
      const snap = () => evaluate('window.threeBodySnapshot()')
      const counters = () => evaluate('({...window.__onlyThemeDraws})')
      const settle = () => evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      const screenshot = async label => {
        const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        const file = `${viewport.name}-${label}.png`
        fs.writeFileSync(path.join(out, file), Buffer.from(image.data, 'base64')); report.screenshots.push(file)
      }
      const click = async (selector, navigation = false) => {
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'})`)
        if (navigation) await wait(150)
        else await settle()
        const r = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return{x,y,width:r.width,height:r.height,reachable:h===e||e.contains(h)}})()`)
        assert.ok(r.width > 0 && r.height > 0 && r.reachable, `${selector}: native pointer target is reachable`)
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 })
        await settle()
      }
      const key = async (key, code, windowsVirtualKeyCode) => {
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode })
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode })
      }
      const noOverflow = async label => {
        const layout = await evaluate('({inner:innerWidth,client:document.documentElement.clientWidth,page:document.documentElement.scrollWidth,body:document.body.scrollWidth})')
        check(layout.inner === viewport.width && layout.page <= layout.client && layout.body <= layout.client, `${viewport.name}: ${label} has no horizontal overflow`)
      }
      const appearance = async label => {
        const state = await evaluate(`(()=>{const visible=e=>!!e&&e.checkVisibility({checkVisibilityCSS:true})&&e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0;const hero=document.querySelector('.home-hero');return{theme:document.documentElement.dataset.theme,toggle:!!document.getElementById('three-body-toggle'),heroDisplay:hero?getComputedStyle(hero).display:null,classicReachable:[...document.querySelectorAll('#planet-enter,#motion-toggle,#planet-webgl,#planet-explorer')].filter(visible).map(e=>e.id),classicLinks:[...document.querySelectorAll('a,button')].filter(visible).filter(e=>/经典档案|返回经典|进入星球/.test(e.textContent+' '+e.getAttribute('aria-label'))).map(e=>e.textContent.trim()),visibleScenes:[...document.querySelectorAll('#three-body-canvas,#planet-webgl,#particle-flow')].filter(visible).map(e=>e.id)}})()`)
        assert.equal(state.theme, 'three-body', `${label}: root HTML uses only three-body`)
        assert.equal(state.toggle, false, `${label}: classic-theme switch is removed`)
        assert.deepEqual(state.classicReachable, [], `${label}: no reachable classic scene controls`)
        assert.deepEqual(state.classicLinks, [], `${label}: no classic-theme navigation`)
        if (state.heroDisplay !== null) assert.equal(state.heroDisplay, 'none', `${label}: historical hero is never displayed`)
        return state
      }
      const stage = async (name, run) => {
        const entry = { name: `${viewport.name}: ${name}`, startedAt: new Date().toISOString() }
        report.stages.push(entry)
        try { await run(entry); entry.passed = true } catch (error) {
          entry.passed = false; entry.error = error.stack
          try {
            entry.failureState = await evaluate('({url:location.href,theme:document.documentElement.dataset.theme,toggle:!!document.getElementById("three-body-toggle"),snapshot:typeof window.threeBodySnapshot==="function"?window.threeBodySnapshot():null})')
            await screenshot(name.replace(/[^a-z0-9]+/gi, '-') + '-failure')
          } catch (captureError) { entry.captureError = captureError.message }
        }
        console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${entry.name}${entry.error ? ': ' + entry.error.split('\n')[0] : ''}`)
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
      }
      try {
        // The legacy planet module exposes no public snapshot/running flag. Observe actual native draw calls.
        // Wrappers pass every call and result through unchanged; no solver, time or rendering state is replaced.
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__onlyThemeDraws={threeBody:0,legacyPlanet:0,legacyParticles:0};const originalContext=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){const context=originalContext.call(this,kind,...args);const key=this.id==='three-body-canvas'?'threeBody':this.id==='planet-webgl'?'legacyPlanet':this.id==='particle-flow'?'legacyParticles':null;if(context&&key&&!context.__onlyThemeObserved){context.__onlyThemeObserved=true;for(const name of (/^webgl/.test(kind)?['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']:kind==='2d'?['drawImage','fillRect','stroke']:[])){const original=context[name];if(original)context[name]=function(...values){window.__onlyThemeDraws[key]++;return original.apply(this,values)}}}return context}` })
        await stage('default root and real lifecycle', async entry => {
          await send('Page.navigate', { url })
          await until('document.readyState==="complete"', 'default root loaded', 15000)
          // Fail immediately on the old default rather than opting into the new theme to conceal it.
          await appearance('fresh root')
          await until('typeof window.threeBodySnapshot==="function" && window.threeBodySnapshot().active && window.threeBodySnapshot().renderer.available && window.__onlyThemeDraws.threeBody>0', 'default route draws actual three-body scene', 20000)
          const visible = await appearance('initialized root')
          assert.deepEqual(visible.visibleScenes, ['three-body-canvas'], 'exactly one visible main scene')
          await noOverflow('root')
          const initial = await snap(), initialDraws = await counters()
          assert.equal(initial.paused, false, 'ordinary default browser starts running')
          assert.equal(initial.bodies.length, 4)
          await until(`window.threeBodySnapshot().simTime>${initial.simTime + 0.2}`, 'default physical time advances', 6000)
          const running = await snap(), runningDraws = await counters()
          check(running.bodies.every((body, i) => body.active && [...body.position, ...body.velocity].every(Number.isFinite) && body.position.some((v, axis) => v !== initial.bodies[i].position[axis])), `${viewport.name}: all four real bodies move with finite state`)
          check(runningDraws.threeBody > initialDraws.threeBody && runningDraws.legacyPlanet === initialDraws.legacyPlanet && runningDraws.legacyParticles === initialDraws.legacyParticles, `${viewport.name}: only the three-body scene continues drawing`)
          entry.legacyObservation = { publicPlanetSnapshot: 'No public snapshot or running flag exists in planet-explorer.mjs; native draw-call observation used.', particleMetrics: await evaluate('window.__fluidParticleMetrics?.snapshot()??null'), before: initialDraws, after: runningDraws }
          await screenshot('default-root')
          await click('#tb-pause')
          const paused = await snap(), pausedDraws = await counters()
          assert.equal(paused.paused, true)
          await wait(450)
          assert.deepEqual(motion(await snap()), motion(paused), 'pause freezes solver, event clock, trails and renderer frames')
          assert.deepEqual(await counters(), pausedDraws, 'pause stops actual native draw calls')
          await click('#tb-step')
          const stepped = await snap()
          check(stepped.paused && Math.abs(stepped.simTime - paused.simTime - 1 / 240) < 1e-9 && stepped.realTime === paused.realTime && stepped.bodies.some((body, i) => body.position.some((v, axis) => v !== paused.bodies[i].position[axis])), `${viewport.name}: one native step advances exactly 1/240 year while real-time clock stays paused`)
          await click('#tb-pause')
          await until('!window.threeBodySnapshot().paused && window.threeBodySnapshot().animationScheduled', 'resume actual scene')
          // Native End key scrolls into authored reading content; it does not alter production state.
          await click('.tb-read')
          await key('End', 'End', 35)
          await until('!window.threeBodySnapshot().visible && !window.threeBodySnapshot().animationScheduled', 'reading moves the actual canvas out of view', 5000)
          await settle()
          const reading = await snap(), readingDraws = await counters()
          await wait(450)
          assert.deepEqual(motion(await snap()), motion(reading), 'reading freezes physical/event/trail clocks and renderer frames')
          assert.deepEqual(await counters(), readingDraws, 'reading stops native draw calls')
          check(reading.paused === false, `${viewport.name}: leaving the viewport suspends a running scene without changing the user pause setting`)
          await noOverflow('reading content')
          await screenshot('reading')
          const routes = await evaluate(`({archive:document.querySelector('a[href*="archives"]')?.href,article:document.querySelector('#latest-posts .post-card h3 a')?.href})`)
          assert.ok(routes.archive && routes.article)
          for (const [name, target] of Object.entries(routes)) {
            await send('Page.navigate', { url: target })
            await until('document.readyState==="complete" && typeof window.threeBodySnapshot==="function"', `${name} loads real production shell`, 15000)
            await appearance(name)
            const content = await evaluate(`(()=>{const main=document.querySelector('main');return{text:main?.textContent.trim().length,readable:!!main&&main.checkVisibility({checkVisibilityCSS:true}),links:[...main.querySelectorAll('a[href]')].filter(e=>e.checkVisibility({checkVisibilityCSS:true})).length}})()`)
            check(content.readable && content.text > 20, `${viewport.name}: ${name} URL retains its readable authored content`)
            if (name === 'archive') check(content.links > 0, `${viewport.name}: archive retains visible links to authored articles`)
            const inner = await snap()
            assert.equal(inner.active, true); assert.equal(inner.renderer.available, false, 'content pages allocate no observation renderer')
            await noOverflow(name)
            await screenshot(name)
            if (name === 'article') {
              for (const destination of ['/archives/', '/']) {
                if (destination === '/') {
                  await send('Page.navigate', { url: target })
                  await until('document.readyState==="complete" && typeof window.threeBodySnapshot==="function"', 'article reloads before checking independent home link', 15000)
                }
                if (!await evaluate('document.querySelector(".site-nav").checkVisibility({checkVisibilityCSS:true})')) await click('.nav-toggle')
                const selector = `.site-nav a[href="${destination}"]`
                check(await evaluate(`(()=>{const a=document.querySelector(${JSON.stringify(selector)});return !!a&&a.checkVisibility({checkVisibilityCSS:true})&&a.textContent.trim().length>0})()`), `${viewport.name}: article navigation to ${destination} is visibly named`)
                await click(selector, true)
                await until(`location.pathname===${JSON.stringify(destination)} && document.readyState==="complete" && typeof window.threeBodySnapshot==="function"`, `native article navigation reaches ${destination}`, 15000)
                await appearance(`native navigation ${destination}`)
                check(await evaluate(destination === '/' ? '!!document.querySelector("#three-body-observatory")' : 'document.querySelectorAll(".archive-list a[href]").length>0'), `${viewport.name}: real article link reaches the expected ${destination} content`)
              }
            }
          }
        })
        await stage('old saved preference and old query cannot restore classic', async entry => {
          await send('Page.navigate', { url })
          await until('document.readyState==="complete"', 'origin is ready for saved preference', 15000)
          // Set only the documented visitor preference, never a core or renderer diagnostic.
          await evaluate("localStorage.setItem('quark-theme','archive')")
          await send('Page.navigate', { url: `${url}?theme=archive` })
          await until('document.readyState==="complete"', 'old URL loaded', 15000)
          await appearance('old saved preference plus old URL')
          await until('window.threeBodySnapshot().active && window.threeBodySnapshot().renderer.available && window.__onlyThemeDraws.threeBody>0', 'old entry still renders the real three-body scene', 20000)
          const before = await snap()
          await until(`window.threeBodySnapshot().simTime>${before.simTime + 0.1}`, 'old entry still runs actual physics', 6000)
          await noOverflow('old preference URL')
          entry.final = { theme: await evaluate('document.documentElement.dataset.theme'), state: await snap(), draws: await counters() }
          check(true, `${viewport.name}: stale archive preference and ?theme=archive cannot reactivate the classic appearance`)
          await screenshot('old-preference-forced-three-body')
        })
      } finally { await browser.close() }
    }
    for (const options of [{ name: 'reduced-motion', reducedMotion: true }, { name: 'no-webgl', noWebGL: true }]) {
      const entry = { name: `${options.name}: default root remains usable`, startedAt: new Date().toISOString() }
      report.stages.push(entry)
      const browser = await launch({ width: 390, height: 844, ...options }, report)
      try {
        const { send, evaluate, until } = browser
        await send('Page.navigate', { url })
        await until('document.readyState==="complete" && typeof window.threeBodySnapshot==="function"', 'accessible default home loads', 15000)
        assert.equal(await evaluate('document.documentElement.dataset.theme'), 'three-body')
        assert.equal(await evaluate('!!document.getElementById("three-body-toggle")'), false)
        await until(options.noWebGL ? 'document.querySelector(".tb-fallback")?.hidden===false' : 'window.threeBodySnapshot().renderer.available && window.threeBodySnapshot().renderer.frames>0', 'default scene reaches its real ready or fallback state', 15000)
        const before = await evaluate('window.threeBodySnapshot()')
        assert.equal(before.active, true); assert.equal(before.paused, true)
        await wait(450)
        assert.deepEqual(motion(await evaluate('window.threeBodySnapshot()')), motion(before), 'reduced motion or absent WebGL does not run continuously')
        if (options.reducedMotion) {
          await evaluate('document.getElementById("tb-step").scrollIntoView({block:"nearest",behavior:"instant"})')
          const r = await evaluate('(()=>{const e=document.getElementById("tb-step"),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return{x,y,reachable:document.elementFromPoint(x,y)===e}})()')
          assert.equal(r.reachable, true)
          await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 })
          await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 })
          const after = await evaluate('window.threeBodySnapshot()')
          check(after.paused && Math.abs(after.simTime - before.simTime - 1 / 240) < 1e-9 && after.realTime === before.realTime, 'Reduced-motion default stays paused and supports one real numerical step')
        } else {
          assert.equal(before.renderer.available, false)
          check(await evaluate('document.querySelector(".tb-fallback").checkVisibility({checkVisibilityCSS:true})'), 'No-WebGL default exposes its actual static fallback window')
        }
        const content = await evaluate('({links:document.querySelectorAll("#latest-posts a[href]").length,archive:!!document.querySelector("a[href*=archives]"),width:innerWidth,page:document.documentElement.scrollWidth,client:document.documentElement.clientWidth})')
        check(content.links > 0 && content.archive && content.width === 390 && content.page <= content.client, `${options.name}: authored article/archive links remain and layout has no overflow`)
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }), filename = `${options.name}-default.png`
        fs.writeFileSync(path.join(out, filename), Buffer.from(shot.data, 'base64')); report.screenshots.push(filename)
        entry.passed = true
      } catch (error) {
        entry.passed = false; entry.error = error.stack
        try { entry.failureState = await browser.evaluate('({theme:document.documentElement.dataset.theme,snapshot:typeof window.threeBodySnapshot==="function"?window.threeBodySnapshot():null})') } catch {}
      } finally { await browser.close() }
      console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${entry.name}${entry.error ? ': ' + entry.error.split('\n')[0] : ''}`)
      fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2))
    }
    check(report.consoleErrors.length === 0, 'No console or browser runtime errors during single-theme acceptance')
    report.passed = report.stages.every(stage => stage.passed)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    report.elapsedMs = performance.now() - start
  }
}
main().catch(error => { report.passed = false; report.error = error.stack }).finally(() => {
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ passed: report.passed, stages: report.stages.map(({ name, passed }) => ({ name, passed })), checks: report.checks.length, elapsedMs: report.elapsedMs, report: path.join(out, 'report.json'), error: report.error }, null, 2))
  if (!report.passed) process.exitCode = 1
})
