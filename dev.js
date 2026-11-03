// Servidor local que imita a Vercel: sirve /public y manda /api/* a api/index.js
// Uso: DATABASE_URL=postgres://... node dev.js  → http://localhost:3000
require('./lib/env');
const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/index');

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      req.query = Object.fromEntries(url.searchParams);
      req.query.path = url.pathname.replace(/^\/api\//, '');
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (d) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(d)); };
      handler(req, res);
    });
    return;
  }
  let file = path.join(__dirname, 'public', decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(__dirname, 'public', 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 3000, () => console.log('EventosPro en http://localhost:' + (process.env.PORT || 3000)));
