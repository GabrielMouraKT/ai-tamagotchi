'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const store = require('./lib/store');

const root = __dirname;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.gif': 'image/gif', '.json': 'application/json; charset=utf-8' };
// Somente estes arquivos são servidos (nada de testes, docs internas, electron/ ou código do servidor).
const STATIC = ['/index.html', '/style.css', '/app.js', '/desktop-ui.js', '/mascots.json', '/lib/core.js', '/lib/anim.js'];
const allowed = p => STATIC.includes(p)
  || /^\/assets\/[a-z0-9_-]+\.png$/i.test(p)
  || /^\/mascotes\/[a-z0-9_-]+\/(original\.png|manifest\.json|animacoes\/[a-z0-9_]+\/[a-z0-9_]+\.(png|gif))$/i.test(p);

function createServer(opts = {}) {
  const dir = opts.dir || store.defaultDir();
  const server = http.createServer((req, res) => {
    // Bloqueia DNS rebinding: só aceita Host local.
    const host = String(req.headers.host || '').toLowerCase();
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) { res.writeHead(403); return res.end('Forbidden'); }
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
    if (pathname === '/api/state') {
      const { sessions, errors } = store.readSessions(dir);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(JSON.stringify({ generatedAt: Date.now(), sessions, errors }));
    }
    if (pathname === '/') pathname = '/index.html';
    if (!allowed(pathname)) { res.writeHead(404); return res.end('Not found'); }
    fs.readFile(path.join(root, pathname), (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(pathname).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  // Sempre 127.0.0.1: nunca expõe a telemetria na rede.
  server.start = () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(opts.port ?? 43771, '127.0.0.1', () => { server.off('error', reject); resolve(server.address().port); });
  });
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT || 43771);
  createServer({ port }).start().then(p => console.log(`AI Tamagotchi: http://127.0.0.1:${p}`))
    .catch(e => { console.error(e.code === 'EADDRINUSE' ? `Porta ${port} em uso. Feche o outro servidor ou use PORT=<outra>.` : e.message); process.exit(1); });
}
