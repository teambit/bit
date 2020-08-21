import { ChildProcess } from 'child_process';
import chokidar from 'chokidar';
import R from 'ramda';
import chalk from 'chalk';
import { Workspace } from '../workspace';
import loader from '../../../cli/loader';
import { BitId } from '../../../bit-id';
import { BIT_VERSION, STARTED_WATCHING_MSG, WATCHER_COMPLETED_MSG } from '../../../constants';
import { pathNormalizeToLinux } from '../../../utils';
import { Consumer } from '../../../consumer';
import { ComponentID } from '../../component';
import logger from '../../../logger/logger';
import { build } from '../../../api/consumer';

export type WatcherProcessData = { watchProcess: ChildProcess; compilerId: BitId; componentIds: BitId[] };

export class Watcher {
  constructor(
    private workspace: Workspace,
    private trackDirs: { [dir: string]: string } = {},
    private verbose = false,
    private multipleWatchers: WatcherProcessData[] = []
  ) {}

  async watch(opts: { verbose?: boolean }) {
    this.verbose = Boolean(opts.verbose);
    await this.watchAll();
  }

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async watchAll() {
    // TODO: run build in the beginning of process (it's work like this in other envs)
    const watcher = this.getWatcher();
    const log = logger.console.bind(logger);
    log(chalk.yellow(`bit binary version: ${BIT_VERSION}`));
    log(chalk.yellow(`node version: ${process.version}`));

    return new Promise((resolve, reject) => {
      // prefix your command with "BIT_LOG=*" to see all watch events
      if (process.env.BIT_LOG) {
        watcher.on('all', (event, path) => {
          log(`Event: "${event}". Path: ${path}`);
        });
      }
      watcher.on('ready', () => {
        log(chalk.yellow(STARTED_WATCHING_MSG));
      });
      watcher.on('change', (p) => {
        log(`file ${p} has been changed`);
        this.handleChange(p).catch((err) => reject(err));
      });
      watcher.on('add', (p) => {
        log(`file ${p} has been added`);
        this.handleChange(p, true).catch((err) => reject(err));
      });
      watcher.on('unlink', (p) => {
        log(`file ${p} has been removed`);
        this.handleChange(p).catch((err) => reject(err));
      });
      watcher.on('error', (err) => {
        log(`Watcher error ${err}`);
        reject(err);
      });
    });
  }

  private async handleChange(filePath: string, isNew = false) {
    const start = new Date().getTime();
    const componentId = await this.getBitIdByPathAndReloadConsumer(filePath, isNew);
    if (!componentId) {
      logger.console(`file ${filePath} is not part of any component, ignoring it`);
      return this.completeWatch(start);
    }
    if (this.isComponentWatchedExternally(componentId)) {
      // update capsule, once done, it automatically triggers the external watcher
      await this.workspace.load([componentId]);
      return this.completeWatch(start);
    }
    const component = await this.workspace.consumer.loadComponent(componentId);
    const idStr = componentId.toString();
    if (component.isLegacy) {
      await this.buildLegacy(idStr);
      return this.completeWatch(start);
    }
    logger.console(`running OnComponentChange hook for ${chalk.bold(idStr)}`);
    let buildResults;
    try {
      buildResults = await this.workspace.triggerOnComponentChange(new ComponentID(componentId));
    } catch (err) {
      // do not exist the watch process on errors, just print them
      logger.console(err.message || err);
      return this.completeWatch(start);
    }
    if (buildResults && buildResults.length) {
      buildResults.forEach((extensionResult) => {
        logger.console(chalk.cyan(`\tresults from ${extensionResult.extensionId}`));
        logger.console(`\t${extensionResult.results.toString()}`);
      });
      return this.completeWatch(start);
    }
    logger.console(`${idStr} doesn't have a compiler, nothing to build`);
    return this.completeWatch(start);
  }

  private completeWatch(start: number) {
    const duration = new Date().getTime() - start;
    loader.stop();
    logger.console(`took ${duration}ms`);
    logger.console(chalk.yellow(WATCHER_COMPLETED_MSG));
  }

  private async buildLegacy(idStr: string) {
    logger.console(`running build for ${chalk.bold(idStr)}`);
    const buildResults = await build(idStr, false, this.verbose, this.workspace.path);
    if (buildResults) {
      logger.console(`\t${chalk.cyan(buildResults.join('\n\t'))}`);
    } else {
      logger.console(`${idStr} doesn't have a compiler, nothing to build`);
    }
  }

  private isComponentWatchedExternally(componentId: BitId) {
    const watcherData = this.multipleWatchers.find((m) => m.componentIds.find((id) => id.isEqual(componentId)));
    if (watcherData) {
      logger.console(`${componentId.toString()} is watched by ${watcherData.compilerId.toString()}`);
      return true;
    }
    return false;
  }

  private async getBitIdByPathAndReloadConsumer(filePath: string, isNew: boolean): Promise<BitId | null | undefined> {
    const relativeFile = pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(filePath));
    let componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
    if (!isNew && !componentId) {
      return null;
    }
    // @todo: improve performance. probably only bit-map and the component itself need to be updated
    await this.workspace._reloadConsumer();

    if (!componentId) {
      componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
    }

    if (isNew && !componentId) {
      const trackDir = Object.keys(this.trackDirs).find((dir) => relativeFile.startsWith(dir));
      if (trackDir) {
        const id = this.trackDirs[trackDir];
        const bitId = this.consumer.getParsedId(id);
        // loading the component causes the bitMap to be updated with the new path
        await this.consumer.loadComponent(bitId);
        componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
      }
    }

    return componentId;
  }

  private getWatcher() {
    const pathsToWatch = this.getPathsToWatch();
    return chokidar.watch(pathsToWatch, {
      ignoreInitial: true,
      // Using the function way since the regular way not working as expected
      // It might be solved when upgrading to chokidar > 3.0.0
      // See:
      // https://github.com/paulmillr/chokidar/issues/773
      // https://github.com/paulmillr/chokidar/issues/492
      // https://github.com/paulmillr/chokidar/issues/724
      ignored: (path) => {
        // Ignore package.json temporarily since it cerates endless loop since it's re-written after each build
        if (path.includes('dist') || path.includes('node_modules') || path.includes('package.json')) {
          return true;
        }
        return false;
      },
      persistent: true,
      useFsEvents: false,
    });
  }

  private getPathsToWatch(): string[] {
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    const paths = componentsFromBitMap.map((componentMap) => {
      const componentId = componentMap.id.toString();
      const trackDir = componentMap.getTrackDir();
      if (trackDir) {
        this.trackDirs[trackDir] = componentId;
      }
      const relativePaths = trackDir ? [trackDir] : componentMap.getFilesRelativeToConsumer();
      const absPaths = relativePaths.map((relativePath) => this.consumer.toAbsolutePath(relativePath));
      if (this.verbose) {
        logger.console(`watching ${chalk.bold(componentId)}\n${absPaths.join('\n')}`);
      }
      return absPaths;
    });
    return R.flatten(paths);
  }
}
