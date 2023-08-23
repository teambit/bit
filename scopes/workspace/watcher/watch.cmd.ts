import chalk from 'chalk';
import moment from 'moment';
import { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { BitBaseEvent, PubsubMain } from '@teambit/pubsub';
import { OnComponentEventResult } from '@teambit/workspace';

// import IDs and events
import { CompilerAspect, CompilerErrorEvent } from '@teambit/compiler';

import { EventMessages, WatchOptions } from './watcher';
import { formatCompileResults, formatWatchPathsSortByComponent } from './output-formatter';
import { CheckTypes } from './check-types';
import { WatcherMain } from './watcher.main.runtime';

export type WatchCmdOpts = {
  verbose?: boolean;
  skipPreCompilation?: boolean;
  checkTypes?: string | boolean;
};

export class WatchCommand implements Command {
  name = 'watch';
  description = 'automatically recompile modified components (on save)';
  extendedDescription = `by default, the watcher doesn't use polling, to keep the CPU idle.
in some rare cases, this could result in missing file events (files are not watched).
to fix it, try to stop other watchers on the same machine.
alternatively, to use polling, run "bit config watch_use_polling true".`;
  helpUrl = 'reference/compiling/compiler-overview';
  alias = '';
  group = 'development';
  options = [
    ['v', 'verbose', 'show all watch events and compiler verbose output'],
    ['', 'skip-pre-compilation', 'skip compilation step before starting to watch'],
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
    private watcher: WatcherMain
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
      msgs: getMessages(this.logger),
      verbose,
      preCompile: !watchCmdOpts.skipPreCompilation,
      spawnTSServer: Boolean(checkTypes), // if check-types is enabled, it must spawn the tsserver.
      checkTypes: getCheckTypesEnum(),
    };
    await this.watcher.watch(watchOpts);
    return 'watcher terminated';
  }
}

function getMessages(logger: Logger): EventMessages {
  return {
    onAll: (event: string, path: string) => logger.console(`Event: "${event}". Path: ${path}`),
    onStart: () => {},
    onReady: (workspace, watchPathsSortByComponent, verbose?: boolean) => {
      clearOutdatedData();
      if (verbose) {
        logger.console(formatWatchPathsSortByComponent(watchPathsSortByComponent));
      }
      logger.console(
        chalk.yellow(
          `Watching for component changes in workspace ${workspace.config.name} (${moment().format('HH:mm:ss')})...\n`
        )
      );
    },
    onChange: (...args) => {
      printOnFileEvent(logger, 'changed', ...args);
    },
    onAdd: (...args) => {
      printOnFileEvent(logger, 'added', ...args);
    },
    onUnlink: (...args) => {
      printOnFileEvent(logger, 'removed', ...args);
    },
    onError: (err) => {
      logger.console(`Watcher error ${err}`);
    },
  };
}

function printOnFileEvent(
  logger: Logger,
  eventMsgPlaceholder: 'changed' | 'added' | 'removed',
  filePaths: string[],
  buildResults: OnComponentEventResult[],
  verbose: boolean,
  duration: number,
  failureMsg?: string
) {
  const files = filePaths.join(', ');
  if (!buildResults.length) {
    failureMsg = failureMsg || `The files ${files} have been ${eventMsgPlaceholder}, but nothing to compile`;
    logger.console(`${failureMsg}\n\n`);
    return;
  }
  logger.console(`The file(s) ${files} have been ${eventMsgPlaceholder}.\n\n`);
  logger.console(formatCompileResults(buildResults, verbose));
  logger.console(`Finished. (${duration}ms)`);
  logger.console(chalk.yellow(`Watching for component changes (${moment().format('HH:mm:ss')})...`));
}

/**
 * with console.clear() all history is deleted from the console. this function preserver the history.
 */
function clearOutdatedData() {
  process.stdout.write('\x1Bc');
}
