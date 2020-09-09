import { ComponentID } from '@teambit/component';
import { build } from 'bit-bin/dist/api/consumer';
import { BitId } from 'bit-bin/dist/bit-id';
import loader from 'bit-bin/dist/cli/loader';
import { BIT_MAP } from 'bit-bin/dist/constants';
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

  async watch(opts: { msgs; verbose?: boolean }) {
    this.verbose = Boolean(opts.verbose);
    await this.watchAll({ msgs: opts.msgs, verbose: this.verbose });
  }

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async watchAll(opts?: { msgs; verbose?: boolean }) {
    // TODO: run build in the beginning of process (it's work like this in other envs)
    const _verbose = opts?.verbose || false;
    this.createWatcher();
    const watcher = this.fsWatcher;
    opts?.msgs?.onStart(this.workspace);

    return new Promise((resolve, reject) => {
      // prefix your command with "BIT_LOG=*" to see all watch events
      if (process.env.BIT_LOG) {
        watcher.on('all', opts?.msgs?.onAll);
      }
      watcher.on('ready', () => {
        opts?.msgs?.onReady(this.workspace, this.getWatchPathsSortByComponent(), _verbose);
      });
      watcher.on('change', async (filePath) => {
        const startTime = new Date().getTime();
        const buildResults = await this.handleChange(filePath).catch((err) => reject(err));
        const duration = new Date().getTime() - startTime;
        opts?.msgs?.onChange(filePath, buildResults, _verbose, duration);
      });
      watcher.on('add', (p) => {
        opts?.msgs?.onAdd(p);
        this.handleChange(p, true).catch((err) => reject(err));
      });
      watcher.on('unlink', (p) => {
        opts?.msgs?.onUnlink(p);
        this.handleChange(p).catch((err) => reject(err));
      });
      watcher.on('error', (err) => {
        opts?.msgs?.onError(err);
        reject(err);
      });
    });
  }

  private async handleChange(filePath: string, isNew = false) {
    const start = new Date().getTime();
    if (filePath.endsWith(BIT_MAP)) {
      await this.handleBitmapChanges();
      return this.completeWatch();
    }
    const componentId = await this.getBitIdByPathAndReloadConsumer(filePath, isNew);
    if (!componentId) {
      logger.console(`file ${filePath} is not part of any component, ignoring it`);
      return this.completeWatch();
    }

    const buildResults = await this.executeWatchOperationsOnComponent(componentId);
    this.completeWatch();
    return buildResults;
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
      return [];
    }
    const component = await this.workspace.consumer.loadComponent(bitId);
    const idStr = bitId.toString();
    if (component.isLegacy) {
      await this.buildLegacy(idStr);
      return [];
    }
    let buildResults;
    const componentId = new ComponentID(bitId);
    try {
      buildResults = isChange
        ? await this.workspace.triggerOnComponentChange(componentId)
        : await this.workspace.triggerOnComponentAdd(componentId);
    } catch (err) {
      // do not exist the watch process on errors, just print them
      logger.console(err.message || err);
      return [];
    }
    if (buildResults && buildResults.length) {
      return buildResults;
    }
    logger.console(`${idStr} doesn't have a compiler, nothing to build`);
  }

  private completeWatch() {
    loader.stop();
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
      const trackDir = componentMap.getTrackDir();
      const relativePaths = trackDir ? [trackDir] : componentMap.getFilesRelativeToConsumer();
      const absPaths = relativePaths.map((relativePath) => this.consumer.toAbsolutePath(relativePath));
      return absPaths;
    });
    const bitmap = this.consumer.toAbsolutePath(BIT_MAP);
    return [...R.flatten(paths), bitmap];
  }

  /**
   * TODO: this should be in the workspace not in the watcher
   * there is already componentDir function that gives you the dir.
   * you can add one more that brings all the paths.
   */
  private getWatchPathsSortByComponent() {
    this.setTrackDirs();
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    return componentsFromBitMap.map((componentMap) => {
      const componentId = componentMap.id;
      const trackDir = componentMap.getTrackDir();
      const relativePaths = trackDir ? [trackDir] : componentMap.getFilesRelativeToConsumer();
      const absPaths = relativePaths.map((relativePath) => this.consumer.toAbsolutePath(relativePath));
      return { componentId: componentId.toString(), absPaths };
    });
  }
}
