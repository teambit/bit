// Genuine CONNECT + HTTPS catalog fixture: never depend on proxy-error replay buffers.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const body = Buffer.from(process.argv[4]);
const catalog = https.createServer({
  key: fs.readFileSync(process.argv[2]),
  cert: fs.readFileSync(process.argv[3]),
}, (request, response) => {
  if (request.method !== 'GET' || request.headers.host !== 'bvm.bit.dev') {
    throw new Error(`unexpected catalog request ${request.method} ${request.headers.host}`);
  }
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': body.length,
    'Connection': 'close',
  });
  fs.appendFileSync(process.argv[5], '1');
  response.end(body);
});
const proxy = http.createServer();
proxy.on('connect', (request, socket, head) => {
  if (request.url !== 'bvm.bit.dev:443') {
    throw new Error(`unexpected tunnel ${request.url}`);
  }
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if (head.length) socket.unshift(head);
  catalog.emit('connection', socket);
});
proxy.listen(0, '127.0.0.1', () => {
  process.stdout.write(`${proxy.address().port}\n`);
});
