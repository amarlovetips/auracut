const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const PUBLIC_DIR = __dirname;
const REMOTE_PASS_URL = "https://raw.githubusercontent.com/amarlovetips/improtent/refs/heads/main/dddblock";

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');

  const reqUrl = req.url.split('?')[0];

  // Internal API Proxy Route for Password (hides GitHub URL from browser DevTools)
  if (reqUrl === '/api/sys-auth-key') {
    https.get(REMOTE_PASS_URL + '?t=' + Date.now(), (remoteRes) => {
      let body = '';
      remoteRes.on('data', chunk => body += chunk);
      remoteRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(body.trim());
      });
    }).on('error', () => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Loveauracutbd');
    });
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, reqUrl === '/' ? 'index.html' : reqUrl);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end('Server Error');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`AuraCut Proxy Server running at http://localhost:${PORT}`);
});
