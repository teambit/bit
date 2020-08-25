import { ComponentID } from '@teambit/component';
import { build } from 'bit-bin/dist/api/consumer';
import { BitId } from 'bit-bin/dist/bit-id';
import loader from 'bit-bin/dist/cli/loader';
import { BIT_MAP, BIT_VERSION, STARTED_WATCHING_MSG, WATCHER_COMPLETED_MSG } from 'bit-bin/dist/constants';
import { Consumer } from 'bit-bin/dist/consumer';
import logger from 'bit-bin/dist/logger/logger';
import { pathNormalizeToLinux } from 'bit-bin/dist/utils';
import Bluebird from 'bluebird';
import chalk from 'chalk';
import { ChildProcess } from 'child_process';
import chokidar, { FSWatcher } from 'chokidar';
import R from 'ramda';

import { Workspace } from '../workspace';

export type WatcherProcessData = { watchProcess: ChildProcess; compilerId: BitId; componentIds: BitId[] };

export class Watcher {
  private fsWatcher: FSWatcher;
  constructor(
    private workspace: Workspace,
    private trackDirs: { [dir: string]: BitId } = {},
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
    this.createWatcher();
    const watcher = this.fsWatcher;
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
    if (filePath.endsWith(BIT_MAP)) {
      await this.handleBitmapChanges();
      return this.completeWatch(start);
    }
    const componentId = await this.getBitIdByPathAndReloadConsumer(filePath, isNew);
    if (!componentId) {
      logger.console(`file ${filePath} is not part of any component, ignoring it`);
      return this.completeWatch(start);
    }
    await this.executeWatchOperationsOnComponent(componentId);
    return this.completeWatch(start);
  }

  /**
   * if .bitmap has change, it's possible that a new component has added. trigger onComponentAdd.
   */
  private async handleBitmapChanges() {
    const previewsTrackDirs = { ...this.trackDirs };
    await this.workspace._reloadConsumer();
    this.setTrackDirs();
    const newDirs: string[] = R.difference(Object.keys(this.trackDirs), Object.keys(previewsTrackDirs));
    if (!newDirs.length) return;
    this.fsWatcher.add(newDirs);
    await Bluebird.mapSeries(newDirs, (dir) => this.executeWatchOperationsOnComponent(this.trackDirs[dir], false));
  }

  private async executeWatchOperationsOnComponent(bitId: BitId, isChange = true) {
    if (this.isComponentWatchedExternally(bitId)) {
      // update capsule, once done, it automatically triggers the external watcher
      await this.workspace.load([bitId]);
      return;
    }
    const component = await this.workspace.consumer.loadComponent(bitId);
    const idStr = bitId.toString();
    if (component.isLegacy) {
      await this.buildLegacy(idStr);
      return;
    }
    const hook = isChange ? 'OnComponentChange' : 'OnComponentAdd';
    logger.console(`running ${hook} hook for ${chalk.bold(idStr)}`);
    let buildResults;
    const componentId = new ComponentID(bitId);
    try {
      buildResults = isChange
        ? await this.workspace.triggerOnComponentChange(componentId)
        : await this.workspace.triggerOnComponentAdd(componentId);
    } catch (err) {
      // do not exist the watch process on errors, just print them
      logger.console(err.message || err);
      return;
    }
    if (buildResults && buildResults.length) {
      buildResults.forEach((extensionResult) => {
        logger.console(chalk.cyan(`\tresults from ${extensionResult.extensionId}`));
        logger.console(`\t${extensionResult.results.toString()}`);
      });
      return;
    }
    logger.console(`${idStr} doesn't have a compiler, nothing to build`);
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
        const bitId = this.trackDirs[trackDir];
        // loading the component causes the bitMap to be updated with the new path
        await this.consumer.loadComponent(bitId);
        componentId = this.consumer.bitMap.getComponentIdByPath(relativeFile);
      }
    }

    return componentId;
  }

  private createWatcher() {
    const pathsToWatch = this.getPathsToWatch();
    this.fsWatcher = chokidar.watch(pathsToWatch, {
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

  setTrackDirs() {
    this.trackDirs = {};
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    componentsFromBitMap.forEach((componentMap) => {
      const componentId = componentMap.id;
      const trackDir = componentMap.getTrackDir();
      if (trackDir) {
        this.trackDirs[trackDir] = componentId;
      }
    });
  }

  private getPathsToWatch(): string[] {
    this.setTrackDirs();
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    const paths = componentsFromBitMap.map((componentMap) => {
      const componentId = componentMap.id;
      const trackDir = componentMap.getTrackDir();
      const relativePaths = trackDir ? [trackDir] : componentMap.getFilesRelativeToConsumer();
      const absPaths = relativePaths.map((relativePath) => this.consumer.toAbsolutePath(relativePath));
      if (this.verbose) {
        logger.console(`watching ${chalk.bold(componentId.toString())}\n${absPaths.join('\n')}`);
      }
      return absPaths;
    });
    const bitmap = this.consumer.toAbsolutePath(BIT_MAP);
    return [...R.flatten(paths), bitmap];
  }
}
