import { Command, CommandOptions } from '@teambit/cli';

import { Watcher } from './watcher';
import chalk from 'chalk';
import moment from 'moment';
import logger from 'bit-bin/dist/logger/logger';
import { formatCompileResults, formatWatchPathsSortByComponent } from './output-formatter';

export class WatchCommand implements Command {

  msgs = {
    onAll: (event, path) => console.log(`Event: "${event}". Path: ${path}`),
    onStart: (workspace) => {},
    onReady: (workspace, watchPathsSortByComponent, verbose) => {
      if (verbose){
        logger.console(formatWatchPathsSortByComponent(watchPathsSortByComponent))
      }
      logger.console(chalk.yellow(`Watching for component changes in workspace ${workspace.config.name} (${moment().format('HH:MM:SS')})...\n`))
    },
    onChange: (filePath, buildResults, verbose, duration) => {
      logger.console(`The file ${filePath} has been changed.\n\n`);
      logger.console(formatCompileResults(buildResults, verbose));
      logger.console(`Finished. (${duration}ms)`);
      logger.console(chalk.yellow(`Watching for component changes (${moment().format('HH:MM:SS')})...`));
    },
    onAdd: (p) => {
      logger.console(`The file ${p} has been added`);
    },
    onUnlink: (p) => {
      logger.console(`file ${p} has been removed`);
    },
    onError: (err) => {
      logger.console(`Watcher error ${err}`);
    }
  }

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
    await this.watcher.watch({ msgs: this.msgs, verbose });
    return 'watcher terminated';
  }
  
}
