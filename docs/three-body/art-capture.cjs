const fs = require('node:fs'), path = require('node:path')
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs')
;(async () => {
  const { server, url } = await serve()
  try {
    for (const width of [1440, 390]) {
      const report = { consoleErrors: [] }
      const browser = await launch({ width, height: width === 1440 ? 900 : 844 }, report)
      try {
        await browser.send('Page.navigate', { url: url + '?theme=three-body' })
        await browser.until('window.threeBodySnapshot?.().renderer.available', 'new scene', 20000)
        await browser.until('window.threeBodySnapshot().realTime >= 8', 'eight seconds of real trajectories', 30000)
        await browser.evaluate('document.querySelector("#tb-pause").click()')
        const capture = async suffix => {
          await browser.evaluate('window.scrollTo(0,0)')
          const shot = await browser.send('Page.captureScreenshot', { format: 'png' })
          fs.writeFileSync(path.join(__dirname, `art-${width}${suffix}.png`), Buffer.from(shot.data, 'base64'))
          fs.writeFileSync(path.join(__dirname, `art-${width}${suffix}.json`), JSON.stringify({ ...report, state: await browser.evaluate('threeBodySnapshot()') }, null, 2))
        }
        await capture('')
        await browser.evaluate('document.querySelector("#tb-lagrange").click()')
        await capture('-lagrange')
        console.log(width, report.consoleErrors)
      } finally { await browser.close() }
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})().catch(error => { console.error(error); process.exitCode = 1 })
