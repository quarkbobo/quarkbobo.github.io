// Run after npm run build. Reuses the isolated, software-WebGL browser harness.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { serve, launch } = require('./verify-planet-explorer.cjs')

async function main () {
  const { server, url } = await serve()
  const results = []
  try {
    for (let run = 0; run < 3; run++) {
      const result = { consoleErrors: [] }
      const browser = await launch({ width: 1440, height: 1000, reducedMotion: true }, result)
      try {
        await browser.send('Network.enable')
        await browser.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1250000, uploadThroughput: 1250000 })
        await browser.send('Emulation.setCPUThrottlingRate', { rate: 4 })
        await browser.send('Page.addScriptToEvaluateOnNewDocument', { source: `
          new MutationObserver(() => {
            if (!window.planetReadyAt && document.querySelector('.planet-webgl-ready')) window.planetReadyAt = performance.now();
          }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
        ` })
        await browser.send('Page.navigate', { url })
        await browser.until('window.planetReadyAt > 0', 'planet first frame', 20000)
        Object.assign(result, await browser.evaluate(`({ readyMs: Math.round(window.planetReadyAt), resources: performance.getEntriesByType('resource').filter(r => /planet-|three\./.test(r.name)).map(r => ({ path: new URL(r.name).pathname, start: Math.round(r.startTime), end: Math.round(r.responseEnd), initiator: r.initiatorType })) })`))
        results.push(result)
        assert.deepEqual(result.consoleErrors, [])
      } finally { await browser.close() }
    }
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  console.log(JSON.stringify(results, null, 2))
  if (process.env.PLANET_LOADING_REPORT) fs.writeFileSync(process.env.PLANET_LOADING_REPORT, JSON.stringify(results, null, 2))
  for (const result of results) {
    const controller = result.resources.find(r => r.path.endsWith('/planet-explorer.mjs'))
    for (const file of ['three.module.min.js', 'three.core.min.js', 'planet-world.mjs', 'planet-flight.mjs']) {
      const resources = result.resources.filter(r => r.path.endsWith('/' + file))
      assert.equal(resources.length, 1, `${file} must be fetched exactly once`)
      assert.ok(resources[0].start < controller.end, `${file} must start before the controller finishes downloading`)
    }
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
