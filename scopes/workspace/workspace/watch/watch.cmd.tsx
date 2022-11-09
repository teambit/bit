import chalk from 'chalk';
import moment from 'moment';
import { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { BitBaseEvent, PubsubMain } from '@teambit/pubsub';

// import IDs and events
import { CompilerAspect, CompilerErrorEvent } from '@teambit/compiler';

import { Watcher, WatchOptions } from './watcher';
import { formatCompileResults, formatWatchPathsSortByComponent } from './output-formatter';
import { OnComponentEventResult } from '../on-component-events';
import { CheckTypes } from './check-types';

export type WatchCmdOpts = {
  verbose?: boolean;
  skipPreCompilation?: boolean;
  checkTypes?: string | boolean;
};

export class WatchCommand implements Command {
  msgs = {
    onAll: (event: string, path: string) => this.logger.console(`Event: "${event}". Path: ${path}`),
    onStart: () => {},
    onReady: (workspace, watchPathsSortByComponent, verbose) => {
      clearOutdatedData();
      if (verbose) {
        this.logger.console(formatWatchPathsSortByComponent(watchPathsSortByComponent));
      }
      this.logger.console(
        chalk.yellow(
          `Watching for component changes in workspace ${workspace.config.name} (${moment().format('HH:mm:ss')})...\n`
        )
      );
    },
    onChange: (
      filePaths: string[],
      buildResults: OnComponentEventResult[],
      verbose: boolean,
      duration,
      failureMsg?: string
    ) => {
      const files = filePaths.join(', ');
      // clearOutdatedData();
      if (!buildResults.length) {
        failureMsg = failureMsg || `The files ${files} have been changed, but nothing to compile`;
        this.logger.console(`${failureMsg}\n\n`);
        return;
      }
      this.logger.console(`The file(s) ${files} have been changed.\n\n`);
      this.logger.console(formatCompileResults(buildResults, verbose));
      this.logger.console(`Finished. (${duration}ms)`);
      this.logger.console(chalk.yellow(`Watching for component changes (${moment().format('HH:mm:ss')})...`));
    },
    onAdd: (
      filePaths: string[],
      buildResults: OnComponentEventResult[],
      verbose: boolean,
      duration,
      failureMsg?: string
    ) => {
      const files = filePaths.join(', ');
      // clearOutdatedData();
      if (!buildResults.length) {
        failureMsg = failureMsg || `The files ${files} have been added, but nothing to compile`;
        this.logger.console(`${failureMsg}\n\n`);
        return;
      }
      this.logger.console(`The file(s) ${filePaths} have been added.\n\n`);
      this.logger.console(formatCompileResults(buildResults, verbose));
      this.logger.console(`Finished. (${duration}ms)`);
      this.logger.console(chalk.yellow(`Watching for component changes (${moment().format('HH:mm:ss')})...`));
    },
    onUnlink: (p) => {
      this.logger.console(`file ${p} has been removed`);
    },
    onError: (err) => {
      this.logger.console(`Watcher error ${err}`);
    },
  };

  name = 'watch';
  description = 'automatically recompile modified components (on save)';
  helpUrl = 'reference/compiling/compiler-overview';
  alias = '';
  group = 'development';
  options = [
    ['v', 'verbose', 'show npm verbose output for inspection and print the stack trace'],
    ['', 'skip-pre-compilation', 'skip the compilation step before starting to watch'],
    [
      't',
      'check-types [string]',
      'EXPERIMENTAL. show errors/warnings for types. options are [file, project] to investigate only changed file or entire project. defaults to project',
    ],
  ] as CommandOptions;

  constructor(
    /**
     * logger extension.
     */
    private pubsub: PubsubMain,

    /**
     * logger extension.
     */
    private logger: Logger,

    /**
     * watcher extension.
     */
    private watcher: Watcher
  ) {
    this.registerToEvents();
  }

  private registerToEvents() {
    this.pubsub.sub(CompilerAspect.id, this.eventsListener);
  }

  private eventsListener = (event: BitBaseEvent<any>) => {
    switch (event.type) {
      case CompilerErrorEvent.TYPE:
        this.logger.console(`Watcher error ${event.data.error}, 'error'`);
        break;
      default:
    }
  };

  async report(cliArgs: [], watchCmdOpts: WatchCmdOpts) {
    const { verbose, checkTypes } = watchCmdOpts;
    const getCheckTypesEnum = () => {
      switch (checkTypes) {
        case undefined:
        case false:
          return CheckTypes.None;
        case 'project':
        case true: // project is the default
          return CheckTypes.EntireProject;
        case 'file':
          return CheckTypes.ChangedFile;
        default:
          throw new Error(`check-types can be either "file" or "project". got "${checkTypes}"`);
      }
    };
    const watchOpts: WatchOptions = {
      msgs: this.msgs,
      verbose,
      preCompile: !watchCmdOpts.skipPreCompilation,
      spawnTSServer: Boolean(checkTypes), // if check-types is enabled, it must spawn the tsserver.
      checkTypes: getCheckTypesEnum(),
    };
    await this.watcher.watchAll(watchOpts);
    return 'watcher terminated';
  }
}

/**
 * with console.clear() all history is deleted from the console. this function preserver the history.
 */
function clearOutdatedData() {
  process.stdout.write('\x1Bc');
}
