import chalk from 'chalk';
import moment from 'moment';
import type { Command, CommandOptions } from '@teambit/cli';
import type { Logger } from '@teambit/logger';
import type { OnComponentEventResult, Workspace } from '@teambit/workspace';
import { ComponentID } from '@teambit/component-id';
import type { EventMessages, RootDirs, WatchOptions } from './watcher';
import { formatCompileResults, formatWatchPathsSortByComponent } from './output-formatter';
import { CheckTypes } from './check-types';
import type { WatcherMain } from './watcher.main.runtime';

type WatchCmdOpts = {
  verbose?: boolean;
  skipPreCompilation?: boolean;
  checkTypes?: string | boolean;
  import?: boolean;
  skipImport?: boolean;
  generateTypes?: boolean;
  trigger?: string;
};

export class WatchCommand implements Command {
  name = 'watch';
  description = 'watch and compile components on file changes';
  extendedDescription = `monitors component files for changes and automatically recompiles them using their environment's configured compiler.
enables immediate feedback during development by keeping components compiled as you work.
by default uses file system events (not polling) to minimize CPU usage - enable polling with "bit config set watch_use_polling true" if needed.`;
  helpUrl = 'reference/compiling/compiler-overview';
  alias = '';
  group = 'component-development';
  options = [
    ['v', 'verbose', 'show all watch events and compiler verbose output'],
    ['', 'skip-pre-compilation', 'skip compilation step before starting to watch'],
    [
      't',
      'check-types [string]',
      'show errors/warnings for types. options are [file, project] to investigate only changed file or entire project. defaults to project',
    ],
    [
      'i',
      'import',
      'DEPRECATED. it is now the default. helpful when using git. import component objects if .bitmap changed not by bit',
    ],
    ['', 'skip-import', 'do not import component objects if .bitmap changed not by bit'],
    ['', 'generate-types', 'EXPERIMENTAL. generate d.ts files for typescript components (hurts performance)'],
    [
      '',
      'trigger <comp-id>',
      'trigger recompilation of the specified component regardless of what changed. helpful when this comp-id must be a bundle',
    ],
  ] as CommandOptions;

  constructor(
    /**
     * logger extension.
     */
    private logger: Logger,

    /**
     * watcher extension.
     */
    private watcher: WatcherMain
  ) {}

  async wait(cliArgs: [], watchCmdOpts: WatchCmdOpts) {
    const { verbose, checkTypes, import: importIfNeeded, skipImport, trigger } = watchCmdOpts;
    if (importIfNeeded) {
      this.logger.consoleWarning('the "--import" flag is deprecated and is now the default behavior');
    }
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
      verbose,
      compile: true,
      preCompile: !watchCmdOpts.skipPreCompilation,
      spawnTSServer: Boolean(checkTypes), // if check-types is enabled, it must spawn the tsserver.
      checkTypes: getCheckTypesEnum(),
      import: !skipImport,
      trigger: trigger ? ComponentID.fromString(trigger) : undefined,
      generateTypes: watchCmdOpts.generateTypes,
      preImport: !skipImport,
    };
    await this.watcher.watch(watchOpts, getMessages(this.logger));
  }
}

function getMessages(logger: Logger): EventMessages {
  return {
    onAll: (event: string, path: string) => logger.console(`Event: "${event}". Path: ${path}`),
    onStart: () => {},
    onReady: (workspace: Workspace, watchPathsSortByComponent: RootDirs, verbose?: boolean) => {
      clearOutdatedData();
      if (verbose) {
        logger.console(formatWatchPathsSortByComponent(watchPathsSortByComponent));
      }
      logger.console(
        chalk.yellow(
          `Watching for component changes in workspace ${workspace.name} (${moment().format('HH:mm:ss')})...\n`
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
    if (!failureMsg) {
      if (verbose) logger.console(`The files ${files} have been ${eventMsgPlaceholder}, but nothing to compile\n\n`);
      return;
    }
    logger.console(`${failureMsg}\n\n`);
    return;
  }
  logger.console(`The file(s) ${files} have been ${eventMsgPlaceholder}.\n`);
  logger.console(formatCompileResults(buildResults));
  logger.console(`Finished (${duration}ms).`);
  logger.console(chalk.yellow(`Watching for component changes (${moment().format('HH:mm:ss')})...`));
}

/**
 * with console.clear() all history is deleted from the console. this function preserver the history.
 */
function clearOutdatedData() {
  process.stdout.write('\x1Bc');
}
