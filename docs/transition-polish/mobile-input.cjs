// Diagnostic reproduction of the frozen mobile pause/drag/zoom interaction.
// Run after a build: node docs/transition-polish/mobile-input.cjs docs/transition-polish/baseline/mobile-input
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')

const evidenceRoot = path.resolve(__dirname)
const outputRoot = path.resolve(process.argv[2] || path.join(evidenceRoot, 'mobile-input'))
assert.ok(outputRoot === evidenceRoot || outputRoot.startsWith(evidenceRoot + path.sep), 'Output must stay inside docs/transition-polish')
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function installProbe () {
  const data = window.__mobileInput = { events: [], matrices: [], draws: [], label: 'initialization', latestView: null }
  const identify = element => element ? `${element.tagName?.toLowerCase() || 'document'}${element.id ? '#' + element.id : ''}${element.classList?.length ? '.' + [...element.classList].join('.') : ''}` : null
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'gotpointercapture', 'lostpointercapture', 'touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'focusin']) {
    document.addEventListener(type, event => {
      const point = event.changedTouches?.[0] || event
      const record = { type, time: performance.now(), eventTimeStamp: event.timeStamp, label: data.label, target: identify(event.target), button: identify(event.target.closest?.('button')), trusted: event.isTrusted, cancelable: event.cancelable, defaultPrevented: event.defaultPrevented, pointerId: event.pointerId, pointerType: event.pointerType, x: point.clientX, y: point.clientY, touchCount: event.touches?.length }
      data.events.push(record)
      queueMicrotask(() => { record.afterDispatchDefaultPrevented = event.defaultPrevented; record.dispatchCompletedAt = performance.now() })
    }, { capture: true, passive: true })
  }
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const gl = originalGetContext.call(this, kind, ...args)
    if (!gl || !/^webgl/.test(kind) || this.id !== 'planet-webgl' || gl.__mobileInput) return gl
    gl.__mobileInput = true
    const names = new Map()
    const getUniformLocation = gl.getUniformLocation.bind(gl)
    gl.getUniformLocation = (program, name) => {
      const location = getUniformLocation(program, name)
      if (location) names.set(location, name)
      return location
    }
    const matrix = gl.uniformMatrix4fv.bind(gl)
    gl.uniformMatrix4fv = (location, transpose, values, ...rest) => {
      if (names.get(location) === 'viewMatrix') {
        const view = Array.from(values)
        if (!data.latestView || view.some((value, index) => value !== data.latestView[index])) {
          data.latestView = view
          data.matrices.push({ time: performance.now(), label: data.label, matrix: view, cameraDistance: Math.hypot(view[12], view[13], view[14]) })
        }
      }
      return matrix(location, transpose, values, ...rest)
    }
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const draw = gl[method]?.bind(gl)
      if (draw) gl[method] = (...values) => {
        data.draws.push({ time: performance.now(), label: data.label, method, mode: values[0], width: gl.drawingBufferWidth, height: gl.drawingBufferHeight })
        return draw(...values)
      }
    }
    return gl
  }
}

;(async () => {
  fs.mkdirSync(outputRoot, { recursive: true })
  const report = { generatedAt: new Date().toISOString(), viewport: { width: 390, height: 844, DPR: 1 }, consoleErrors: [], checkpoints: [], taps: [], captures: [], comparisons: [] }
  const { server, url } = await serve()
  let browser
  try {
    browser = await launch({ width: 390, height: 844 }, report)
    const { send, evaluate, until } = browser
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installProbe.toString()})()` })
    const bounds = selector => evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`)
    const checkpoint = async label => {
      const state = await evaluate(`(() => {
        const data=window.__mobileInput;
        const button=document.querySelector('#planet-zoom-in');
        const rect=button?.getBoundingClientRect();
        const identify=el=>el ? el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(el.className?'.'+String(el.className).trim().replaceAll(' ','.'):'') : null;
        const chain=[]; for(let el=button;el;el=el.parentElement) { const s=getComputedStyle(el); chain.push({element:identify(el),touchAction:s.touchAction,pointerEvents:s.pointerEvents,zIndex:s.zIndex,inert:el.inert}); }
        const x=rect?.x+rect?.width/2, y=rect?.y+rect?.height/2;
        return { time:performance.now(), phase:document.querySelector('#planet-explorer')?.dataset.phase, open:document.querySelector('#planet-explorer')?.open, paused:document.querySelector('#planet-pause')?.getAttribute('aria-pressed'), activeElement:identify(document.activeElement), zoom:rect?{x,y,width:rect.width,height:rect.height,disabled:button.disabled,hit:identify(document.elementFromPoint(x,y)),hitStack:document.elementsFromPoint(x,y).map(identify),ancestorStyles:chain}:null, cameraView:data.latestView, cameraDistance:data.latestView?Math.hypot(...data.latestView.slice(12,15)):null, drawCount:window.__planetQA.draws, eventCount:data.events.length, scroll:{x:scrollX,y:scrollY}, visualViewport:{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale,offsetLeft:visualViewport.offsetLeft,offsetTop:visualViewport.offsetTop} };
      })()`)
      report.checkpoints.push({ label, ...state })
      return state
    }
    const click = async selector => {
      await evaluate(`window.__mobileInput.label=${JSON.stringify('tap:' + selector)}; document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center', behavior:'instant'})`)
      const box = await bounds(selector)
      assert.ok(box.width > 0 && box.height > 0, `${selector} is visible`)
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      const hit = await evaluate(`(() => {const el=document.elementFromPoint(${x},${y});return {time:performance.now(),tag:el?.tagName,id:el?.id,button:el?.closest('button')?.id};})()`)
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      report.taps.push({ selector, x, y, hit, afterDispatch: await evaluate('performance.now()') })
    }
    const settleAnimations = () => until(`document.querySelector('#planet-explorer').getAnimations({subtree:true}).every(animation => animation.playState !== 'running' && !animation.pending)`, 'CSS settles', 3000)
    const capture = async (label, crop = false) => {
      const box = crop ? await bounds('#planet-webgl') : undefined
      const clip = box ? { x: Math.round(box.x + box.width * 0.12), y: Math.round(box.y + box.height * 0.22), width: Math.round(box.width * 0.76), height: Math.round(box.height * 0.3), scale: 1 } : undefined
      const before = await evaluate('performance.now()')
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip ? { clip } : {}) })
      const after = await evaluate('performance.now()')
      const bytes = Buffer.from(screenshot.data, 'base64')
      fs.writeFileSync(path.join(outputRoot, `${label}.png`), bytes)
      const record = { label, before, after, clip, sha256: createHash('sha256').update(bytes).digest('hex') }
      report.captures.push(record)
      return { ...record, data: screenshot.data }
    }
    const compare = async (first, second) => {
      const difference = await evaluate(`(async () => {
        const frames = await Promise.all(${JSON.stringify([first.data, second.data])}.map(async data => {
          const image=new Image(); image.src='data:image/png;base64,'+data; await image.decode();
          const canvas=new OffscreenCanvas(image.width,image.height); const context=canvas.getContext('2d');
          context.drawImage(image,0,0); return {width:image.width,height:image.height,data:context.getImageData(0,0,image.width,image.height).data};
        }));
        if(frames[0].width!==frames[1].width || frames[0].height!==frames[1].height) return {same:false,reason:'different dimensions'};
        let changedPixels=0,maxDelta=0,squaredDelta=0;
        for(let i=0;i<frames[0].data.length;i+=4) { let delta=0; for(let channel=0;channel<4;channel++) {const d=Math.abs(frames[0].data[i+channel]-frames[1].data[i+channel]);delta=Math.max(delta,d);squaredDelta+=d*d;}if(delta)changedPixels++;maxDelta=Math.max(maxDelta,delta); }
        const rms=Math.sqrt(squaredDelta/frames[0].data.length);
        return {same:maxDelta<=2&&rms<=0.5,changedPixels,maxDelta,rms,pixels:frames[0].width*frames[0].height};
      })()`)
      report.comparisons.push({ first: first.label, second: second.label, ...difference })
      return difference
    }

    await send('Page.navigate', { url })
    await until(`document.readyState === 'complete'`, 'homepage loaded', 12000)
    await until(`document.querySelector('.home-hero')?.classList.contains('planet-webgl-ready') && window.__planetQA.draws > 0`, 'WebGL ready', 12000)
    await capture('home')
    await click('#planet-enter')
    await until(`document.querySelector('#planet-explorer')?.open`, 'dialog open')
    await until(`document.querySelector('#planet-explorer')?.dataset.phase === 'interior'`, 'interior', 6000)
    // Match the frozen route checks between entry and the interior screenshot.
    const links = await evaluate(`Array.from(document.querySelectorAll('#planet-explorer a[data-planet-node]'), a=>({href:a.href}))`)
    for (const link of links) { const response = await fetch(link.href); assert.ok(response.ok); await response.text() }
    await settleAnimations()
    await capture('interior')
    await click('#planet-pause')
    await settleAnimations()
    const paused = await capture('paused', true)
    await wait(250)
    const pausedStable = await capture('paused-stable', true)
    await compare(paused, pausedStable)
    await checkpoint('paused-before-drag')
    await evaluate(`window.__mobileInput.label='drag'`)
    const canvas = await bounds('#planet-webgl')
    const x = canvas.x + canvas.width * 0.5
    const y = canvas.y + canvas.height * 0.5
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    for (let step = 1; step <= 6; step++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 12, y: y + step * 4, id: 1 }] })
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await wait(150)
    const orbit = await capture('orbit', true)
    await compare(orbit, paused)
    await checkpoint('after-drag-before-zoom')
    await click('#planet-zoom-in')
    await checkpoint('zoom-immediately-after-dispatch')
    await wait(150)
    await checkpoint('zoom-after-150ms-before-capture')
    const zoomed = await capture('zoom-in-150ms', true)
    await compare(zoomed, orbit)
    await checkpoint('zoom-after-capture')
    await wait(350)
    await checkpoint('zoom-after-additional-350ms')
    const later = await capture('zoom-in-later', true)
    await compare(later, orbit)
    await capture('zoom-full')
    await evaluate(`window.__mobileInput.label='programmatic-zoom'; document.querySelector('#planet-zoom-in').click()`)
    await wait(150)
    await checkpoint('after-programmatic-zoom')
    const programmatic = await capture('programmatic-zoom', true)
    await compare(programmatic, later)
    report.raw = await evaluate('window.__mobileInput')
    assert.deepEqual(report.consoleErrors, [], 'No browser errors')
  } catch (error) {
    report.error = error.stack || String(error)
    if (browser) {
      try { report.raw = await browser.evaluate('window.__mobileInput') } catch {}
      try { const image = await browser.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(outputRoot, 'failure.png'), Buffer.from(image.data, 'base64')) } catch {}
    }
    throw error
  } finally {
    fs.writeFileSync(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ ...report, raw: report.raw ? { eventCount: report.raw.events.length, viewChanges: report.raw.matrices.length, drawCount: report.raw.draws.length, eventsAfterDrag: report.raw.events.filter(event => !['initialization', 'tap:#planet-enter', 'tap:#planet-pause'].includes(event.label)) } : null }, null, 2))
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
