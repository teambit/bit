import fetch from 'node-fetch';
import fs from 'fs-extra';
import { join } from 'path';
import EventSource from 'eventsource';
import { findScopePath } from '@teambit/scope.modules.find-scope-path';
import chalk from 'chalk';
import loader from '@teambit/legacy/dist/cli/loader';

export class ServerPortFileNotFound extends Error {
  constructor(filePath: string) {
    super(`server port file not found at ${filePath}`);
  }
}
export class ServerNotFound extends Error {
  constructor(port: number) {
    super(`bit server is not running on port ${port}`);
  }
}

export class ServerCommander {
  private isJson = false;
  async execute() {
    try {
      const results = await this.runCommandWithHttpServer();
      if (results) {
        if (this.isJson) {
          const code = results.code || 0;
          const data = results.data || results;
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(data, null, 2));
          process.exit(code);
        } else {
          loader.off();
          // eslint-disable-next-line no-console
          console.log(results.data);
          process.exit(results.exitCode);
        }
      }

      process.exit(0);
    } catch (err: any) {
      if (err instanceof ServerPortFileNotFound || err instanceof ServerNotFound) throw err;
      // eslint-disable-next-line no-console
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  }

  async runCommandWithHttpServer(): Promise<Record<string, any> | undefined> {
    const port = await this.getExistingUsedPort();
    const url = `http://localhost:${port}/api`;
    this.initSSE(url);
    // parse the args and options from the command
    const [cmd, ...rest] = process.argv.slice(2);
    const args = rest.filter((arg) => !arg.startsWith('-'));
    const options = rest
      .filter((arg) => arg.startsWith('-'))
      .reduce((acc, curr) => {
        const opt = curr.startsWith('--') ? curr.slice(2) : curr.slice(1);
        const [key, val] = opt.split('=');
        acc[key] = val || true;
        return acc;
      }, {} as Record<string, boolean | string>);

    this.isJson = Boolean(options.json || options.j);
    if (!this.isJson) loader.on();
    const endpoint = `cli/${cmd}`;
    const format = this.isJson ? 'json' : 'report';
    const pwd = process.cwd();
    const body = { args, options, format, isTerminal: true, pwd };
    let res;
    try {
      res = await fetch(`${url}/${endpoint}`, {
        method: 'post',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      if (err.code === 'ECONNREFUSED') {
        throw new ServerNotFound(port);
      }
      throw new Error(`failed to run command "${cmd}" on the server. ${err.message}`);
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
  }

  async getExistingUsedPort(): Promise<number> {
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

  private getServerPortFilePath() {
    const scopePath = findScopePath(process.cwd());
    if (!scopePath) {
      throw new Error(`scope not found at ${process.cwd()}`);
    }
    return join(scopePath, 'server-port.txt');
  }
}

export function shouldUseBitServer() {
  const commandsToSkip = ['start', 'run', 'watch', 'init', 'server'];
  return (
    process.env.BIT_CLI_SERVER &&
    !process.argv.includes('--help') &&
    !process.argv.includes('-h') &&
    process.argv.length > 2 && // if it has no args, it shows the help
    !commandsToSkip.includes(process.argv[2])
  );
}
