// Real-time diagnostic only; run after a build and separately from benchmarks.
// node docs/transition-polish/diagnose.cjs docs/transition-polish/baseline/diagnostic
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')

const evidenceRoot = path.resolve(__dirname)
const outputRoot = path.resolve(process.argv[2] || path.join(evidenceRoot, 'diagnostic'))
assert.ok(outputRoot === evidenceRoot || outputRoot.startsWith(evidenceRoot + path.sep), 'Output must stay inside docs/transition-polish')
assert.ok(!process.argv.slice(2).some(argument => argument.startsWith('--')), 'Pass an output directory only')
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const round = value => Number.isFinite(value) ? +value.toFixed(3) : null

function installProbe () {
  const data = window.__polishDiagnostic = {
    operation: 'initialization', frames: [], calls: [], longTasks: [], contexts: [], draws: 0,
    longTaskSupported: PerformanceObserver.supportedEntryTypes.includes('longtask')
  }
  const phase = () => document.getElementById('planet-explorer')?.dataset.phase || 'homepage'
  if (data.longTaskSupported) {
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) data.longTasks.push({ start: entry.startTime, duration: entry.duration, name: entry.name })
    }).observe({ type: 'longtask', buffered: true })
  }
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
    const gl = getContext.call(this, kind, ...args)
    if (!gl || !/^webgl/.test(kind) || this.id !== 'planet-webgl' || gl.__polishDiagnostic) return gl
    gl.__polishDiagnostic = true
    const extensions = gl.getSupportedExtensions() || []
    const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info')
    data.contexts.push({
      kind, attributes: gl.getContextAttributes(),
      renderer: rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimerExtensions: extensions.filter(name => /disjoint_timer_query/.test(name)),
      gpuTiming: 'Capability reported only. No timer queries or gl.finish are issued; JavaScript call durations are not GPU execution times.'
    })
    for (const method of ['compileShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter']) {
      const original = gl[method]
      if (!original) continue
      gl[method] = function (...values) {
        const start = performance.now()
        try { return original.apply(this, values) } finally {
          data.calls.push({ method, start, duration: performance.now() - start, operation: data.operation, phase: phase(), parameter: method.endsWith('Parameter') ? values[1] : undefined })
        }
      }
    }
    let currentFrame
    const clear = gl.clear
    gl.clear = function (...values) {
      const start = performance.now()
      currentFrame = { time: start, phase: phase(), operation: data.operation, width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, drawCalls: 0, submittedVerticesOrIndices: 0, modes: {} }
      data.frames.push(currentFrame)
      try { return clear.apply(this, values) } finally { currentFrame.clearCallMs = performance.now() - start }
    }
    for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = gl[method]
      if (!original) continue
      gl[method] = function (...values) {
        data.draws++
        if (currentFrame) {
          currentFrame.drawCalls++
          const count = method.startsWith('drawArrays') ? values[2] : values[1]
          const instances = method.endsWith('Instanced') ? values.at(-1) : 1
          currentFrame.submittedVerticesOrIndices += count * instances
          currentFrame.modes[values[0]] = (currentFrame.modes[values[0]] || 0) + 1
        }
        return original.apply(this, values)
      }
    }
    return gl
  }
}

function frameStats (frames) {
  const gaps = frames.slice(1).map((frame, index) => frame.time - frames[index].time).sort((a, b) => a - b)
  return {
    frames: frames.length,
    averageFPS: frames.length > 1 ? round(1000 * (frames.length - 1) / (frames.at(-1).time - frames[0].time)) : null,
    medianFrameMs: round(gaps[Math.floor(gaps.length / 2)]),
    p95FrameMs: round(gaps[Math.floor(gaps.length * 0.95)]),
    largestFrameGapMs: round(gaps.at(-1)),
    drawingBuffers: [...new Set(frames.map(frame => `${frame.width}x${frame.height}`))],
    drawCalls: frames.reduce((sum, frame) => sum + frame.drawCalls, 0),
    perFrameDrawCalls: [...new Set(frames.map(frame => frame.drawCalls))].sort((a, b) => a - b),
    submittedVerticesOrIndices: [...new Set(frames.map(frame => frame.submittedVerticesOrIndices))].sort((a, b) => a - b)
  }
}

async function runCase (options, url) {
  const result = { viewport: options, consoleErrors: [], actions: [] }
  let browser
  try {
    browser = await launch(options, result)
    const { send, evaluate, until } = browser
    await send('Performance.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${installProbe.toString()})()` })
    await send('Page.navigate', { url })
    await until(`document.querySelector('.planet-webgl-ready')`, 'WebGL ready', 15000)
    const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).metrics.map(metric => [metric.name, metric.value]))
    async function activate (name, selector, settled, dwell) {
      const before = await metrics()
      const timing = await evaluate(`new Promise(resolve => {
        const data = window.__polishDiagnostic;
        data.operation = ${JSON.stringify(name)};
        const start = performance.now();
        document.querySelector(${JSON.stringify(selector)}).click();
        const handlerEnd = performance.now();
        requestAnimationFrame(timestamp => resolve({ start, handlerEnd, synchronousClickMs: handlerEnd - start, firstRAFMs: performance.now() - start, firstRAFTimestamp: timestamp }));
      })`)
      await until(settled, `${name} settles`, 15000)
      const settledAt = await evaluate('performance.now()')
      await wait(dwell)
      const end = await evaluate('performance.now()')
      const after = await metrics()
      result.actions.push({ name, ...timing, settledAt, end, observedSettledMs: settledAt - timing.start, cdpMetricsDelta: Object.fromEntries(['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'JSHeapUsedSize'].map(key => [key, round(after[key] - before[key])])) })
    }
    for (const cycle of ['first', 'repeat']) {
      await activate(`${cycle}Entry`, '#planet-enter', `document.querySelector('#planet-explorer').dataset.phase === 'interior'`, 2200)
      await activate(`${cycle}Return`, '#planet-close', `!document.querySelector('#planet-explorer').open`, 250)
    }
    result.raw = await evaluate('window.__polishDiagnostic')
    for (const action of result.actions) {
      const frames = result.raw.frames.filter(frame => frame.operation === action.name)
      action.phases = Object.fromEntries([...new Set(frames.map(frame => frame.phase))].map(phase => [phase, frameStats(frames.filter(frame => frame.phase === phase))]))
      action.firstDrawMs = frames.length ? round(frames[0].time - action.start) : null
      action.longTasks = result.raw.longTasks.filter(task => task.start < action.end && task.start + task.duration > action.start)
      const calls = result.raw.calls.filter(call => call.operation === action.name)
      action.compilationCalls = Object.fromEntries([...new Set(calls.map(call => call.method))].map(method => {
        const matching = calls.filter(call => call.method === method)
        return [method, { count: matching.length, totalCallMs: round(matching.reduce((sum, call) => sum + call.duration, 0)), maximumCallMs: round(Math.max(...matching.map(call => call.duration))) }]
      }))
    }
    assert.deepEqual(result.consoleErrors, [], `Browser errors at ${options.width}x${options.height}`)
    return result
  } finally {
    if (browser) await browser.close()
  }
}

;(async () => {
  fs.mkdirSync(outputRoot, { recursive: true })
  const { server, url } = await serve()
  const report = {
    generatedAt: new Date().toISOString(),
    environment: 'Frozen launch helper: isolated Chromium SwiftShader, DPR 1, desktop then mobile sequentially; no virtual clock, RAF replacement, resolution change, or synchronous GPU fence.',
    interpretation: [
      'Programmatic button activation matches the frozen performance probe and deliberately avoids hover/focus prewarming. It measures the cold activation path, not trusted input dispatch latency.',
      'Synchronous click duration measures handler and synchronous work; firstRAFMs includes that work and scheduling delay. Settled time is polled and is an upper bound.',
      'compile/link/query call times are main-thread elapsed time and can include driver waits. Clear gaps measure submitted render pacing, not monitor presentation or GPU execution time.',
      'CDP duration metrics are seconds. Heap delta is bytes. Draw-call counts are submitted calls, not a mesh/object inventory; submitted vertices/indices include instancing.',
      'Instrumentation adds overhead. Use the unchanged leader-motion-baseline.cjs probe for the pass/fail performance comparison. This report identifies candidate causes only.'
    ],
    cases: []
  }
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const result = await runCase(viewport, url)
      report.cases.push(result)
      fs.writeFileSync(path.join(outputRoot, `${viewport.width}x${viewport.height}.json`), JSON.stringify(result, null, 2) + '\n')
    }
    fs.writeFileSync(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ ...report, cases: report.cases.map(({ raw, ...result }) => ({ ...result, contexts: raw.contexts, rawFrames: raw.frames.length, rawCompilationCalls: raw.calls.length })) }, null, 2))
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
