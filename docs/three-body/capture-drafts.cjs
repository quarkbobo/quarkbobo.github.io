const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { once } = require('node:events');
const { launch } = require('../../tools/verify-planet-explorer.cjs');
(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/favicon')) return res.writeHead(204).end();
    res.writeHead(200, { 'content-type': 'text/html;charset=utf-8' }).end(fs.readFileSync(path.join(__dirname, 'drafts.html')));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const out = path.join(__dirname, 'drafts'); fs.mkdirSync(out, { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const report = { consoleErrors: [] };
      const b = await launch({ width, height: width === 1440 ? 900 : 844, reducedMotion: true }, report);
      try {
        for (const design of ['panoramic', 'ring', 'bridge']) {
          await b.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/?design=${design}` });
          await b.until("document.readyState === 'complete'", 'draft ready');
          const shot = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
          fs.writeFileSync(path.join(out, `${design}-${width}.png`), Buffer.from(shot.data, 'base64'));
          console.log('CAPTURE', design, width, await b.evaluate('document.documentElement.scrollWidth <= innerWidth'));
        }
      } finally { await b.close(); }
    }
  } finally { server.closeAllConnections(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
