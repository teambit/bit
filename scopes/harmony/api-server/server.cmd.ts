// eslint-disable-next-line max-classes-per-file
import { Command, CommandOptions } from '@teambit/cli';
import { BitServerMain } from './bit-server.main.runtime';

export class ServerCmd implements Command {
  name = 'server';
  description = 'EXPERIMENTAL. communicate with bit cli program via http requests';
  alias = '';
  commands: Command[] = [];
  group = 'general';
  options = [['p', 'port [port]', 'port to run the server on']] as CommandOptions;

  constructor(private bitServer: BitServerMain) {}

  async report(args, options: { port: number }): Promise<string> {
    await this.bitServer.runBitServer(options);
    return 'server is running successfully'; // should never get here, the previous line is blocking
  }
}
