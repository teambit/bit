// A real CONNECT tunnel to a listening HTTPS catalog keeps socket ownership separate.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const body = Buffer.from(process.argv[4]);
const record = (event, details = {}) => fs.appendFileSync(`${process.argv[5]}.transport`, JSON.stringify({ event, ...details }) + '\n');
let sequence = 0;
const catalog = https.createServer({
  key: fs.readFileSync(process.argv[2]),
  cert: fs.readFileSync(process.argv[3]),
}, (request, response) => {
  if (request.method !== 'GET' || request.headers.host !== 'bvm.bit.dev') {
    throw new Error(`unexpected catalog request ${request.method} ${request.headers.host}`);
  }
  const id = ++sequence;
  record('request', { id, method: request.method, host: request.headers.host });
  request.on('error', error => record('request-error', { id, code: error.code, message: error.message }));
  response.on('close', () => record('response-close', { id, finished: response.writableFinished }));
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': body.length,
    'Connection': 'close',
  });
  fs.appendFileSync(process.argv[5], '1');
  response.on('finish', () => {
    fs.appendFileSync(`${process.argv[5]}.finished`, '1');
    record('response-finish', { id });
  });
  response.end(body);
});
const proxy = http.createServer();
proxy.on('connect', (request, socket, head) => {
  if (request.url !== 'bvm.bit.dev:443') {
    throw new Error(`unexpected tunnel ${request.url}`);
  }
  const tunnel = ++sequence;
  record('tunnel', { tunnel, url: request.url, headBytes: head.length });
  const upstream = net.connect(catalog.address().port, '127.0.0.1');
  upstream.once('connect', () => {
    record('upstream-connect', { tunnel });
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on('error', (error) => {
    record('upstream-error', { tunnel, code: error.code, message: error.message });
    console.error(`catalog tunnel: ${error.code || error.message}`);
    socket.destroy();
  });
  upstream.on('end', () => record('upstream-end', { tunnel }));
  upstream.on('close', hadError => record('upstream-close', { tunnel, hadError }));
  socket.on('end', () => record('client-end', { tunnel }));
  socket.on('error', error => {
    record('client-error', { tunnel, code: error.code, message: error.message });
    upstream.destroy();
  });
  socket.once('close', hadError => {
    record('client-close', { tunnel, hadError, upstreamDestroyed: upstream.destroyed });
    upstream.destroy();
  });
});
catalog.on('tlsClientError', error => {
  record('tls-error', { code: error.code, message: error.message });
  console.error(`catalog TLS: ${error.code || error.message}`);
});
catalog.listen(0, '127.0.0.1', () => {
  proxy.listen(0, '127.0.0.1', () => {
    process.stdout.write(`${proxy.address().port}\n`);
  });
});
