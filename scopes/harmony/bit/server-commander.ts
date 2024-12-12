/**
 * This file is responsible for interacting with bit through a long-running background process "bit-server" rather than directly.
 * Why not directly?
 * 1. startup cost. currently it takes around 1 second to bootstrap bit.
 * 2. an experimental package-manager saves node_modules in-memory. if a client starts a new process, it won't have the node_modules in-memory.
 *
 * In this file, there are three ways to achieve this. It's outlined in the order it was evolved.
 * The big challenge here is to show the output correctly to the client even though the server is running in a different process.
 *
 * 1. process.env.BIT_CLI_SERVER === 'true'
 * This method uses SSE - Server Send Events. The server sends events to the client with the output to print. The client listens to
 * these events and prints them. It's cumbersome. For this, the logger was changed and every time the logger needs to print to the console,
 * it was using this SSE to send events. Same with the loader.
 * Cons: Other output, such as pnpm, needs an extra effort to print - for pnpm, the "process" object was passed to pnpm
 * and its stdout was modified to use the SSE.
 * However, other tools that print directly to the console, such as Jest, won't work.
 *
 * 2. process.env.BIT_CLI_SERVER_TTY === 'true'
 * Because the terminal - tty is a fd (file descriptor) on mac/linux, it can be passed to the server. The server can write to this
 * fd and it will be printed to the client terminal. On the server, the process.stdout.write was monkey-patched to
 * write to the tty. (see cli-raw.route.ts file).
 * It solves the problem of Jest and other tools that print directly to the console.
 * Cons:
 * A. It doesn't work on Windows. Windows doesn't treat tty as a file descriptor.
 * B. We need two ways communication. Commands such as "bit update", display a prompt with option to select using the arrow keys.
 *    This is not possible with the tty approach. Also, if the client hits Ctrl+C, the server won't know about it and it
 *    won't kill the process.
 *
 * 3. process.env.BIT_CLI_SERVER_PTY === 'true'
 * This is the most advanced approach. It spawns a pty (pseudo terminal) process to communicate between the client and the server.
 * The client connects to the server using a socket. The server writes to the socket and the client reads from it.
 * The client also writes to the socket and the server reads from it. See server-forever.ts to understand better.
 * In order to pass terminal sequences, such as arrow keys or Ctrl+C, the stdin of the client is set to raw mode.
 * In theory, this approach could work by spawning a normal process, not pty, however, then, the stdin/stdout are non-tty,
 * and as a result, loaders such as Ora and chalk won't work.
 * With this new approach, we also support terminating and reloading the server. A new command is added
 * "bit server-forever", which spawns the pty-process. If the client hits Ctrl+C, this server-forever process will kill
 * the pty-process and re-load it.
 * Keep in mind, that to send the command and get the results, we still using http. The usage of the pty is only for
 * the input/output during the command.
 * I was trying to avoid the http, and use only the pty, by implementing readline to get the command from the socket,
 * but then I wasn't able to return the prompt to the user easily. So, I decided to keep the http for the request/response part.
 */

import fetch from 'node-fetch';
import net from 'net';
import fs from 'fs-extra';
import { exec, execSync } from 'child_process';
import { join, dirname } from 'path';
import os from 'os';
import EventSource from 'eventsource';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import chalk from 'chalk';
import { loader } from '@teambit/legacy.loader';
import { printBitVersionIfAsked } from './bootstrap';
import { getPidByPort, getSocketPort } from './server-forever';

const CMD_SERVER_PORT = 'cli-server-port';
const CMD_SERVER_PORT_DELETE = 'cli-server-port-delete';
const CMD_SERVER_SOCKET_PORT = 'cli-server-socket-port';

class ServerPortFileNotFound extends Error {
  constructor(filePath: string) {
    super(`server port file not found at ${filePath}`);
  }
}
class ServerIsNotRunning extends Error {
  constructor(port: number) {
    super(`bit server is not running on port ${port}`);
  }
}
class ScopeNotFound extends Error {
  constructor(scopePath: string) {
    super(`scope not found at ${scopePath}`);
  }
}

type CommandResult = { data: any; exitCode: number };

export class ServerCommander {
  async execute() {
    try {
      const results = await this.runCommandWithHttpServer();
      if (results) {
        const { data, exitCode } = results;
        loader.off();
        const dataToPrint = typeof data === 'string' ? data : JSON.stringify(data, undefined, 2);
        // eslint-disable-next-line no-console
        console.log(dataToPrint);
        process.exit(exitCode);
      }

      process.exit(0);
    } catch (err: any) {
      if (err instanceof ScopeNotFound || err instanceof ServerPortFileNotFound || err instanceof ServerIsNotRunning) {
        throw err;
      }
      loader.off();
      // eslint-disable-next-line no-console
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  private shouldUseTTYPath() {
    if (process.platform === 'win32') return false; // windows doesn't support tty path
    return process.env.BIT_CLI_SERVER_TTY === 'true';
  }

  async runCommandWithHttpServer(): Promise<CommandResult | undefined | void> {
    if (process.argv.includes(CMD_SERVER_PORT)) return this.printPortAndExit();
    if (process.argv.includes(CMD_SERVER_SOCKET_PORT)) return this.printSocketPortAndExit();
    if (process.argv.includes(CMD_SERVER_PORT_DELETE)) return this.deletePortAndExit();
    printBitVersionIfAsked();
    const port = await this.getExistingUsedPort();
    const url = `http://localhost:${port}/api`;
    const shouldUsePTY = process.env.BIT_CLI_SERVER_PTY === 'true';

    if (shouldUsePTY) {
      await this.connectToSocket();
    }
    const ttyPath = this.shouldUseTTYPath()
      ? execSync('tty', {
          encoding: 'utf8',
          stdio: ['inherit', 'pipe', 'pipe'],
        }).trim()
      : undefined;
    if (!ttyPath && !shouldUsePTY) this.initSSE(url);
    // parse the args and options from the command
    const args = process.argv.slice(2);
    if (!args.includes('--json') && !args.includes('-j')) {
      loader.on();
    }
    const endpoint = `cli-raw`;
    const pwd = process.cwd();
    const body = { command: args, pwd, envBitFeatures: process.env.BIT_FEATURES, ttyPath, isPty: shouldUsePTY };
    let res;
    try {
      res = await fetch(`${url}/${endpoint}`, {
        method: 'post',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED') {
        await this.deleteServerPortFile();
        throw new ServerIsNotRunning(port);
      }
      throw new Error(`failed to run command "${args.join(' ')}" on the server. ${err.message}`);
    }

    if (res.ok) {
      const results = await res.json();
      return results;
    }

    let jsonResponse;
    try {
      jsonResponse = await res.json();
    } catch {
      // the response is not json, ignore the body.
    }
    throw new Error(jsonResponse?.message || jsonResponse || res.statusText);
  }

  private async connectToSocket() {
    return new Promise<void>((resolve, reject) => {
      const socketPort = getSocketPort();
      const socket = net.createConnection({ port: socketPort });

      const resetStdin = () => {
        process.stdin.setRawMode(false);
        process.stdin.pause();
      };

      // Handle errors that occur before or after connection
      socket.on('error', (err: any) => {
        if (err.code === 'ECONNREFUSED') {
          reject(
            new Error(`Error: Unable to connect to the socket on port ${socketPort}.
Please run the command "bit server-forever" first to start the server.`)
          );
        }
        resetStdin();
        socket.destroy(); // Ensure the socket is fully closed
        reject(err);
      });

      // Handle successful connection
      socket.on('connect', () => {
        process.stdin.setRawMode(true);
        process.stdin.resume();

        // Forward stdin to the socket
        process.stdin.on('data', (data: any) => {
          socket.write(data);

          // Detect Ctrl+C (hex code '03')
          if (data.toString('hex') === '03') {
            // Important to write it to the socket so the server knows to kill the PTY process
            process.stdin.setRawMode(false);
            process.stdin.pause();
            socket.end();
            process.exit();
          }
        });

        // Forward data from the socket to stdout
        socket.on('data', (data: any) => {
          process.stdout.write(data);
        });

        // Handle socket close and end events
        const cleanup = () => {
          resetStdin();
          socket.destroy();
        };

        socket.on('close', cleanup);
        socket.on('end', cleanup);

        resolve(); // Connection successful, resolve the Promise
      });
    });
  }

  /**
   * Initialize the server-sent events (SSE) connection to the server.
   * This is used to print the logs and show the loader during the command.
   * Without this, it only shows the response from http server, but not the "logger.console" or "logger.setStatusLine" texts.
   *
   * I wasn't able to find a better way to do it. The challenge here is that the http server is running in a different
   * process, which is not connected to the current process in any way. (unlike the IDE which is its child process and
   * can access its stdout).
   * One of the attempts I made is sending the "tty" path to the server and let the server console log to that path, but
   * it didn't work well. It was printed only after the response came back from the server.
   */
  private initSSE(url: string) {
    const eventSource = new EventSource(`${url}/sse-events`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    eventSource.onerror = (_error: any) => {
      // eslint-disable-next-line no-console
      // console.error('Error occurred in SSE connection:', _error);
      // probably was unable to connect to the server and will throw ServerNotFound right after. no need to show this error.
      eventSource.close();
    };
    eventSource.addEventListener('onLoader', (event: any) => {
      const parsed = JSON.parse(event.data);
      const { method, args } = parsed;
      loader[method](...(args || []));
    });
    eventSource.addEventListener('onLogWritten', (event: any) => {
      const parsed = JSON.parse(event.data);
      process.stdout.write(parsed.message);
    });
  }

  private async printPortAndExit() {
    try {
      const port = await this.getExistingUsedPort();
      process.stdout.write(port.toString());
      process.exit(0);
    } catch (err: any) {
      if (err instanceof ScopeNotFound || err instanceof ServerPortFileNotFound || err instanceof ServerIsNotRunning) {
        process.exit(0);
      }
      console.error(err.message); // eslint-disable-line no-console
      process.exit(1);
    }
  }
  private async deletePortAndExit() {
    try {
      await this.deleteServerPortFile();
      process.exit(0);
    } catch {
      // probably file doesn't exist.
      process.exit(0);
    }
  }

  private printSocketPortAndExit() {
    try {
      const port = getSocketPort();
      process.stdout.write(port.toString());
      process.exit(0);
    } catch (err: any) {
      console.error(err.message); // eslint-disable-line no-console
      process.exit(1);
    }
  }

  private async getExistingUsedPort(): Promise<number> {
    const port = await this.getExistingPort();
    const isPortInUse = await this.isPortInUseForCurrentDir(port);
    if (!isPortInUse) {
      await this.deleteServerPortFile();
      throw new ServerIsNotRunning(port);
    }

    return port;
  }

  private async isPortInUseForCurrentDir(port: number) {
    const pid = getPidByPort(port);
    if (!pid) {
      return false;
    }
    const dirUsedByPort = await getCwdByPid(pid);
    if (!dirUsedByPort) {
      // might not be supported by Windows. this is on-best-effort basis.
      return true;
    }
    const currentDir = process.cwd();
    return dirUsedByPort === currentDir;
  }

  private async getExistingPort(): Promise<number> {
    const filePath = this.getServerPortFilePath();
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      return parseInt(fileContent, 10);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new ServerPortFileNotFound(filePath);
      }
      throw err;
    }
  }

  private async deleteServerPortFile() {
    const filePath = this.getServerPortFilePath();
    await fs.remove(filePath);
  }

  private getServerPortFilePath() {
    const scopePath = findScopePath(process.cwd());
    if (!scopePath) {
      throw new ScopeNotFound(process.cwd());
    }
    return join(scopePath, 'server-port.txt');
  }
}

export function shouldUseBitServer() {
  const commandsToSkip = ['start', 'run', 'watch', 'server'];
  const hasFlag =
    process.env.BIT_CLI_SERVER === 'true' ||
    process.env.BIT_CLI_SERVER === '1' ||
    process.env.BIT_CLI_SERVER_PTY === 'true' ||
    process.env.BIT_CLI_SERVER_TTY === 'true';
  return (
    hasFlag &&
    process.argv.length > 2 && // if it has no args, it shows the help
    !commandsToSkip.includes(process.argv[2])
  );
}

/**
 * Executes a command and returns stdout as a string.
 */
function execCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Get the CWD of a process by PID.
 *
 * On Linux: readlink /proc/<pid>/cwd
 * On macOS: lsof -p <pid> and parse line with 'cwd'
 * On Windows: Attempt with wmic (not guaranteed)
 */
async function getCwdByPid(pid: string): Promise<string | null> {
  const platform = os.platform();

  try {
    if (platform === 'linux') {
      const cwd = await execCommand(`readlink /proc/${pid}/cwd`);
      return cwd || null;
    } else if (platform === 'darwin') {
      // macOS does not have /proc, but lsof -p <pid> shows cwd line like:
      // COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF   NODE NAME
      // node    12345 user  cwd    DIR    1,2      1024  56789 /Users/username/project
      const output = await execCommand(`lsof -p ${pid}`);
      const line = output.split('\n').find((l) => l.includes(' cwd '));
      if (!line) return null;
      const parts = line.trim().split(/\s+/);
      // The last part should be the directory path
      return parts[parts.length - 1] || null;
    } else if (platform === 'win32') {
      // On Windows, we can try wmic:
      // wmic process where "ProcessId=<pid>" get CommandLine,ExecutablePath
      // CommandLine or ExecutablePath might give hints.
      // This is not guaranteed to give the original working directory, as Windows doesn't expose it easily.
      const output = await execCommand(`wmic process where "ProcessId=${pid}" get ExecutablePath /format:list`);
      // Output looks like:
      // ExecutablePath=C:\path\to\executable.exe
      const line = output.split('\n').find((l) => l.startsWith('ExecutablePath='));
      if (line) {
        const exePath = line.split('=')[1].trim();
        // Guess: the working directory might be the directory containing the executable
        return dirname(exePath);
      }
      // If no executable path, try CommandLine
      const cmdOutput = await execCommand(`wmic process where "ProcessId=${pid}" get CommandLine /format:list`);
      const cmdLine = cmdOutput.split('\n').find((l) => l.startsWith('CommandLine='));
      if (cmdLine) {
        const command = cmdLine.split('=')[1].trim();
        // Attempt a guess: if command is a full path, take its directory
        if (command.includes('\\')) {
          return dirname(command.split(' ')[0]);
        }
      }
      return null;
    } else {
      throw new Error(`Platform ${platform} not supported`);
    }
  } catch {
    return null;
  }
}
