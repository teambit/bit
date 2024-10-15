/* eslint-disable no-console */

import net from 'net';
const pty = require('node-pty');

export function spawnPTY() {
  // Create a PTY (terminal emulation) running the 'bit server' process
  // this way, we can catch terminal sequences like arrows, ctrl+c, etc.
  const ptyProcess = pty.spawn('bit', ['server', '--pty'], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
  });

  // Create a TCP server
  const server = net.createServer((socket) => {
    console.log('Client connected.');

    // Forward data from the client to the ptyProcess
    socket.on('data', (data) => {
      // console.log('Server received data from client:', data.toString());
      if (data.toString('hex') === '03') {
        // User hit ctrl+c
        ptyProcess.kill();
      } else {
        ptyProcess.write(data);
      }
    });

    // Forward data from the ptyProcess to the client
    ptyProcess.on('data', (data) => {
      // console.log('ptyProcess data:', data.toString());
      socket.write(data);
    });

    // Handle client disconnect
    socket.on('end', (item) => {
      console.log('Client disconnected.', item);
    });

    // Handle errors
    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    ptyProcess.on('exit', (code, signal) => {
      console.log(`PTY exited with code ${code} and signal ${signal}`);
      socket.end();
      server.close();
      setTimeout(() => {
        console.log('restarting the server');
        spawnPTY();
      }, 500);
    });

    ptyProcess.on('error', (err) => {
      console.error('PTY process error:', err);
    });
  });

  const PORT = 5002;
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}
