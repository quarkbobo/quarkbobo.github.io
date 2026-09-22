const fs = require('node:fs'), path = require('node:path');
const { serve, launch } = require('../../tools/verify-planet-explorer.cjs');
(async () => {
  const { server, url } = await serve();
  try {
    for (const width of [1440, 390]) {
      const result = { consoleErrors: [] };
      const b = await launch({ width, height: width === 1440 ? 900 : 844 }, result);
      try {
        await b.send('Page.navigate', { url: url + '?theme=three-body' });
        await b.until('window.threeBodySnapshot?.().renderer.available', 'new scene', 20000);
        await new Promise(r => setTimeout(r, 2500));
        await b.evaluate('document.querySelector("#tb-pause").click()');
        const shot = await b.send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(__dirname, `inspect-${width}.png`), Buffer.from(shot.data, 'base64'));
        const data = await b.evaluate(`({state:threeBodySnapshot(),deck:document.querySelector('.tb-deck').getBoundingClientRect().height,viewport:innerHeight,window:document.querySelector('.tb-window').getBoundingClientRect().toJSON()})`);
        fs.writeFileSync(path.join(__dirname, `inspect-${width}.json`), JSON.stringify({ ...data, ...result }, null, 2));
        console.log(width, 'errors', result.consoleErrors, 'deck', data.deck, 'suns', data.state.bodies.length, 'renderer', data.state.renderer.frames);
      } finally { await b.close(); }
    }
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
