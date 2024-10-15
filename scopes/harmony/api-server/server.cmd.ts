// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import { ApiServerMain } from './api-server.main.runtime';

export class ServerCmd implements Command {
  name = 'server';
  description = 'communicate with bit cli program via http requests';
  alias = '';
  commands: Command[] = [];
  group = 'general';
  options = [
    ['p', 'port [port]', 'port to run the server on'],
    ['c', 'compile', 'compile components during the watch process'],
    ['', 'pty', 'use pty for child process'],
  ] as CommandOptions;

  constructor(private apiServer: ApiServerMain) {}

  async wait(args, options: { port: number; compile: boolean; pty?: boolean }) {
    await this.apiServer.runApiServer(options);
  }
}
