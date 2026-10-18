// A real CONNECT tunnel to a listening HTTPS catalog keeps socket ownership separate.
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
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
  response.on('finish', () => fs.appendFileSync(`${process.argv[5]}.finished`, '1'));
  response.end(body);
});
const proxy = http.createServer();
proxy.on('connect', (request, socket, head) => {
  if (request.url !== 'bvm.bit.dev:443') {
    throw new Error(`unexpected tunnel ${request.url}`);
  }
  const upstream = net.connect(catalog.address().port, '127.0.0.1');
  upstream.once('connect', () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on('error', (error) => {
    console.error(`catalog tunnel: ${error.code || error.message}`);
    socket.destroy();
  });
  socket.on('error', () => upstream.destroy());
  socket.once('close', () => upstream.destroy());
});
catalog.on('tlsClientError', error => console.error(`catalog TLS: ${error.code || error.message}`));
catalog.listen(0, '127.0.0.1', () => {
  proxy.listen(0, '127.0.0.1', () => {
    process.stdout.write(`${proxy.address().port}\n`);
  });
});
