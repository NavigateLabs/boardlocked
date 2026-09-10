'use strict';
// Dependency-free static server, bound only to this computer.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8080);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400).end('Invalid URL'); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep) || pathname.split('/').some(part => part.startsWith('.')) || !types[path.extname(file).toLowerCase()]) {
        res.writeHead(403).end('Forbidden'); return;
    }
    fs.stat(file, (err, stat) => {
        if (err || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()], 'Cache-Control': 'no-cache' });
        fs.createReadStream(file).pipe(res);
    });
});
server.listen(port, '127.0.0.1', () => console.log('Local Chunk Picker: http://127.0.0.1:' + port + '/?local=default'));
