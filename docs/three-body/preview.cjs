const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const publicRoot = path.resolve(__dirname, '../../public');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') return res.writeHead(204).end();
    const docs = url.pathname.startsWith('/__three-body/');
    const base = docs ? __dirname : publicRoot;
    const route = decodeURIComponent(docs ? url.pathname.slice('/__three-body'.length) : url.pathname);
    let file = path.resolve(base, '.' + route);
    if (file !== base && !file.startsWith(base + path.sep)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end('Not found');
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch { res.writeHead(400).end('Bad request'); }
}).listen(4173, '127.0.0.1', () => console.log('Three-body preview: http://127.0.0.1:4173/?theme=three-body'));
