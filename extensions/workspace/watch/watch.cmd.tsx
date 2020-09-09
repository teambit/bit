import chalk from 'chalk';
import moment from 'moment';

import { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';

import { Watcher } from './watcher';
import { formatCompileResults, formatWatchPathsSortByComponent } from './output-formatter';

export class WatchCommand implements Command {
  msgs = {
    onAll: (event, path) => this.logger.console(`Event: "${event}". Path: ${path}`),
    onStart: () => {},
    onReady: (workspace, watchPathsSortByComponent, verbose) => {
      if (verbose) {
        this.logger.console(formatWatchPathsSortByComponent(watchPathsSortByComponent));
      }
      this.logger.console(
        chalk.yellow(
          `Watching for component changes in workspace ${workspace.config.name} (${moment().format('HH:MM:SS')})...\n`
        )
      );
    },
    onChange: (filePath, buildResults, verbose, duration) => {
      this.logger.console(`The file ${filePath} has been changed.\n\n`);
      this.logger.console(formatCompileResults(buildResults, verbose));
      this.logger.console(`Finished. (${duration}ms)`);
      this.logger.console(chalk.yellow(`Watching for component changes (${moment().format('HH:MM:SS')})...`));
    },
    onAdd: (p) => {
      this.logger.console(`The file ${p} has been added`);
    },
    onUnlink: (p) => {
      this.logger.console(`file ${p} has been removed`);
    },
    onError: (err) => {
      this.logger.console(`Watcher error ${err}`);
    },
  };

  name = 'watch';
  description = 'watch a set of components';
  alias = '';
  group = 'env';
  shortDescription = '';
  options = [['v', 'verbose', 'showing npm verbose output for inspection and prints stack trace']] as CommandOptions;

  constructor(
    /**
     * logger extension.
     */
    private logger: Logger,

    /**
     * watcher extension.
     */
    private watcher: Watcher
  ) {}

  async report(cliArgs: [], { verbose = false }: { verbose?: boolean }) {
    await this.watcher.watch({ msgs: this.msgs, verbose });
    return 'watcher terminated';
  }
}
