const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { launch } = require('../../../tools/verify-planet-explorer.cjs')
;(async () => {
  const results = []
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    const result = { viewport, consoleErrors: [], url: 'https://quarkbobo.github.io/' }
    let browser
    try {
      browser = await launch(viewport, result)
      await browser.send('Page.navigate', { url: result.url + '?release=25e6650' })
      await browser.until(`document.querySelector('.planet-webgl-ready') && window.__planetQA.draws > 0`, 'Live homepage renders WebGL', 20000)
      await browser.evaluate(`document.querySelector('#planet-enter').click()`)
      await browser.until(`document.querySelector('#planet-explorer').dataset.phase === 'interior'`, 'Live interior is usable', 10000)
      result.interior = await browser.evaluate(`({open:document.querySelector('#planet-explorer').open,canvasParent:document.querySelector('#planet-webgl').parentElement.id,labels:document.querySelectorAll('.planet-node-label:not([hidden])').length,draws:window.__planetQA.draws})`)
      assert.equal(result.interior.open, true)
      assert.equal(result.interior.canvasParent, 'planet-stage')
      assert.equal(result.interior.labels, 3)
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      fs.writeFileSync(path.join(__dirname, `live-${viewport.width}.png`), Buffer.from(screenshot.data, 'base64'))
      await browser.evaluate(`document.querySelector('#planet-close').click()`)
      await browser.until(`!document.querySelector('#planet-explorer').open && document.querySelector('#planet-webgl').parentElement.id === 'planet-viewport'`, 'Live return restores homepage', 5000)
      result.returned = true
      // The unchanged site has no favicon; the local QA server returns 204 for
      // that browser request, whereas Pages returns 404. Preserve it in the
      // report and fail on every other console error, including module loads.
      result.existingAssetErrors = result.consoleErrors.filter(error => error === 'Failed to load resource: the server responded with a status of 404 () https://quarkbobo.github.io/favicon.ico')
      assert.deepEqual(result.consoleErrors.filter(error => !result.existingAssetErrors.includes(error)), [])
      results.push(result)
      console.log(`PASS live ${viewport.width}x${viewport.height}: WebGL homepage, entry, 3 stations, return; unexpected console errors 0; existing favicon 404: ${result.existingAssetErrors.length}`)
    } finally {
      if (browser) await browser.close()
    }
  }
  fs.writeFileSync(path.join(__dirname, 'live-browser.json'), JSON.stringify(results, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
