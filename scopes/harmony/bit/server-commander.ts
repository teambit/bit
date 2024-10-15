import fetch from 'node-fetch';
import net from 'net';
import fs from 'fs-extra';
import { execSync } from 'child_process';
import { join } from 'path';
import EventSource from 'eventsource';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import chalk from 'chalk';
import loader from '@teambit/legacy/dist/cli/loader';
import { printBitVersionIfAsked } from './bootstrap';

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

  async runCommandWithHttpServer(): Promise<CommandResult | undefined> {
    await this.printPortIfAsked();
    printBitVersionIfAsked();
    const port = await this.getExistingUsedPort();
    const url = `http://localhost:${port}/api`;
    const shouldUsePTY = process.env.BIT_CLI_SERVER_PTY === 'true';

    if (shouldUsePTY) {
      // Connect to the server
      const socket = net.createConnection({ port: 5002 }, () => {
        process.stdin.setRawMode(true);
        process.stdin.resume();

        // Forward stdin to the socket
        process.stdin.on('data', (data: any) => {
          socket.write(data);
          // User hit ctrl+c
          if (data.toString('hex') === '03') {
            // important to write it to the socket, so the server knows to kill the pty process
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

        // Handle socket close
        socket.on('close', () => {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        });

        socket.on('end', () => {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        });

        // Handle errors
        socket.on('error', (err) => {
          // eslint-disable-next-line no-console
          console.error('Socket error:', err);
          process.stdin.setRawMode(false);
          process.stdin.pause();
        });
      });
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
    } catch (e: any) {
      // the response is not json, ignore the body.
    }
    throw new Error(jsonResponse?.message || jsonResponse || res.statusText);
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

  private async printPortIfAsked() {
    if (!process.argv.includes('cli-server-port')) return;
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

  private async getExistingUsedPort(): Promise<number> {
    const port = await this.getExistingPort();
    const isPortInUse = await this.isPortInUse(port);
    if (!isPortInUse) {
      await this.deleteServerPortFile();
      throw new ServerIsNotRunning(port);
    }

    return port;
  }

  private isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.once('error', (err: any) => {
        if (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH') {
          resolve(false);
        } else {
          reject(err);
        }
      });

      client.once('connect', () => {
        client.end();
        resolve(true);
      });

      client.connect({ port, host: 'localhost' });
    });
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
