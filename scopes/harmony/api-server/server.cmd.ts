// eslint-disable-next-line max-classes-per-file
import type { Command, CommandOptions } from '@teambit/cli';
import type { ApiServerMain } from './api-server.main.runtime';
import { serverCommand } from './api-server.commands';

export class ServerCmd implements Command {
  name = serverCommand.name;
  description = serverCommand.description;
  alias = serverCommand.alias;
  commands: Command[] = serverCommand.commands;
  group = serverCommand.group;
  options = serverCommand.options;
  private = serverCommand.private;

  constructor(private apiServer: ApiServerMain) {}

  async wait(args, options: { port: number; compile: boolean }) {
    await this.apiServer.runApiServer(options);
  }
}
