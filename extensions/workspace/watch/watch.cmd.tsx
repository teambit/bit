import { Command, CommandOptions } from '@teambit/cli';
import { Watcher } from './watcher';

export class WatchCommand implements Command {
  name = 'watch';
  description = 'watch a set of components';
  alias = '';
  group = 'env';
  shortDescription = '';
  options = [['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace']] as CommandOptions;

  constructor(
    /**
     * watcher extension.
     */
    private watcher: Watcher
  ) {}

  async report(cliArgs: [], { verbose = false }: { verbose?: boolean }) {
    await this.watcher.watch({ verbose });
    return 'watcher terminated';
  }
}
