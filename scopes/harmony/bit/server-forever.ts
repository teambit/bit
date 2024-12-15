/**
 * see the docs of server-commander.ts for more info
 * this "server-forever" command is used to run the bit server in a way that it will never stop. if it gets killed,
 * it will restart itself.
 * it spawns "bit server" using node-pty for a pseudo-terminal (PTY) in order for libs such as inquirer/ora/chalk to work properly.
 */

/* eslint-disable no-console */

import net from 'net';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { spawn } from '@lydell/node-pty';

export function spawnPTY() {
  // Create a PTY (terminal emulation) running the 'bit server' process
  // this way, we can catch terminal sequences like arrows, ctrl+c, etc.
  const flags = process.argv.slice(2).filter((arg) => arg.startsWith('-'));
  const ptyProcess = spawn('bit', ['server', ...flags], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
  });

  // Keep track of connected clients
  const clients: net.Socket[] = [];

  let didGetClient = false;
  let outputNotForClients = false;

  // @ts-ignore
  ptyProcess.on('data', (data) => {
    if (!clients.length) outputNotForClients = data.toString();
    // Forward data from the ptyProcess to connected clients
    // console.log('ptyProcess data:', data.toString());
    clients.forEach((socket) => {
      socket.write(data);
    });
  });

  // Create a TCP server
  const server = net.createServer((socket) => {
    console.log('Client connected.');
    didGetClient = true;
    clients.push(socket);

    // Forward data from the client to the ptyProcess
    socket.on('data', (data: any) => {
      // console.log('Server received data from client:', data.toString());
      if (data.toString('hex') === '03') {
        // User hit Ctrl+C
        ptyProcess.kill();
      } else {
        ptyProcess.write(data);
      }
    });

    // Handle client disconnect
    socket.on('end', () => {
      console.log('Client disconnected.');
      const index = clients.indexOf(socket);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });

    // Handle socket errors
    socket.on('error', (err) => {
      console.error('Socket error:', err);
      const index = clients.indexOf(socket);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    });
  });

  const PORT = getSocketPort();

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      const pid = getPidByPort(PORT, true);
      const usedByPid = pid ? ` (used by PID ${pid})` : '';
      const killCmd = pid ? `\nAlternatively, you can kill the process by running "kill ${pid}".` : '';
      console.error(`Error: Port ${PORT} is already in use${usedByPid}.
This port is assigned based on the workspace path: '${process.cwd()}'
This means another instance may already be running in this workspace.
\nTo resolve this issue:
- If another instance is running, please stop it before starting a new one.
  If a vscode is open on this workspace, it might be running the server. Close it.${killCmd}
- If no other instance is running, the port may be occupied by another application.
  You can override the default port by setting the 'BIT_CLI_SERVER_SOCKET_PORT' environment variable.
`);
      process.exit(1); // Exit the process with an error code
    } else {
      console.error('Server encountered an error:', err);
      process.exit(1);
    }
  });

  server.listen(PORT, () => {
    console.log(`Socket listening on port ${PORT}`);
  });

  // @ts-ignore
  ptyProcess.on('exit', (code, signal) => {
    server.close();
    if (didGetClient) {
      console.log(`PTY exited with code ${code} and signal ${signal}`);
      setTimeout(() => {
        console.log('Restarting the PTY process...');
        spawnPTY(); // Restart the PTY process
      }, 100);
    } else {
      console.error(`Failed to start the PTY Process. Error: ${outputNotForClients}`);
    }
  });
}

export function getSocketPort(): number {
  return process.env.BIT_CLI_SERVER_SOCKET_PORT
    ? parseInt(process.env.BIT_CLI_SERVER_SOCKET_PORT)
    : getPortFromPath(process.cwd());
}

/**
 * it's easier to generate a random port based on the workspace path than to save it in a file
 */
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

export function getPidByPort(port: number, consoleErrors = false): string | null {
  const platform = process.platform;
  try {
    if (platform === 'darwin' || platform === 'linux') {
      // For macOS and Linux
      const cmd = `lsof -iTCP:${port} -sTCP:LISTEN -n -P`;
      const stdout = execSync(cmd).toString();
      const lines = stdout.trim().split('\n');

      if (lines.length > 1) {
        // Skip the header line and parse the first result
        const columns = lines[1].split(/\s+/);
        const pid = columns[1];
        return pid;
      }
    } else if (platform === 'win32') {
      // For Windows
      const cmd = `netstat -ano -p tcp`;
      const stdout = execSync(cmd).toString();
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        if (line.trim().startsWith('TCP')) {
          const columns = line.trim().split(/\s+/);
          const localAddress = columns[1];
          const pid = columns[4];

          if (localAddress.endsWith(`:${port}`)) {
            return pid;
          }
        }
      }
    } else {
      if (consoleErrors) console.error('Unsupported platform:', platform);
    }
  } catch (error: any) {
    if (consoleErrors) console.error('Error executing command:', error.message);
  }
  return null;
}
