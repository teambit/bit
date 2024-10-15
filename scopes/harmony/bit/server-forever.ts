/* eslint-disable no-console */

import net from 'net';
import crypto from 'crypto';
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

  const PORT = getSocketPort();

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Error: Port ${PORT} is already in use.`);
      console.error(`This port is assigned based on the workspace path: '${process.cwd()}'`);
      console.error(`This means another instance may already be running in this workspace.`);
      console.error(`\nTo resolve this issue:`);
      console.error(`- If another instance is running, please stop it before starting a new one.`);
      console.error(`- If no other instance is running, the port may be occupied by another application.`);
      console.error(
        `  You can override the default port by setting the 'BIT_CLI_SERVER_SOCKET_PORT' environment variable.`
      );
      process.exit(1); // Exit the process with an error code
    } else {
      console.error('Server encountered an error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export function getSocketPort(): number {
  return process.env.BIT_CLI_SERVER_SOCKET_PORT
    ? parseInt(process.env.BIT_CLI_SERVER_SOCKET_PORT)
    : getPortFromPath(process.cwd());
}

export function getPortFromPath(path: string): number {
  // Step 1: Hash the workspace path using MD5
  const hash = crypto.createHash('md5').update(path).digest('hex');

  // Step 2: Convert a portion of the hash to an integer
  // We'll use the first 8 characters (32 bits)
  const hashInt = parseInt(hash.substring(0, 8), 16);

  // Step 3: Map the integer to the port range 49152 to 65535 (these are dynamic ports not assigned by IANA)
  const minPort = 49152;
  const maxPort = 65535;
  const portRange = maxPort - minPort + 1;

  const port = (hashInt % portRange) + minPort;

  return port;
}
