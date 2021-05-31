import { PubsubMain } from '@teambit/pubsub';
import { dirname } from 'path';
import { ComponentID } from '@teambit/component';

import { BitId } from '@teambit/legacy-bit-id';
import loader from '@teambit/legacy/dist/cli/loader';
import { BIT_MAP, COMPONENT_ORIGINS } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import logger from '@teambit/legacy/dist/logger/logger';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';

import mapSeries from 'p-map-series';
import chalk from 'chalk';
import { ChildProcess } from 'child_process';
import chokidar, { FSWatcher } from 'chokidar';
import R from 'ramda';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';

import { WorkspaceAspect } from '../';
import { OnComponentChangeEvent, OnComponentAddEvent, OnComponentRemovedEvent } from '../events';
import { Workspace } from '../workspace';
import { OnComponentEventResult } from '../on-component-events';

export type WatcherProcessData = { watchProcess: ChildProcess; compilerId: BitId; componentIds: BitId[] };

export class Watcher {
  private fsWatcher: FSWatcher;
  constructor(
    private workspace: Workspace,
    private pubsub: PubsubMain,
    private trackDirs: { [dir: string]: ComponentID } = {},
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
    await this.createWatcher();
    const watcher = this.fsWatcher;
    opts?.msgs?.onStart(this.workspace);

    return new Promise((resolve, reject) => {
      // prefix your command with "BIT_LOG=*" to see all watch events
      if (process.env.BIT_LOG) {
        if (opts?.msgs?.onAll) watcher.on('all', opts?.msgs?.onAll);
      }
      watcher.on('ready', () => {
        opts?.msgs?.onReady(this.workspace, this.trackDirs, _verbose);
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('change', async (filePath) => {
        const startTime = new Date().getTime();
        const buildResults = (await this.handleChange(filePath)) || [];
        const duration = new Date().getTime() - startTime;
        opts?.msgs?.onChange(filePath, buildResults, _verbose, duration);
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('add', async (filePath) => {
        const startTime = new Date().getTime();
        const buildResults = (await this.handleChange(filePath)) || [];
        const duration = new Date().getTime() - startTime;
        opts?.msgs?.onAdd(filePath, buildResults, _verbose, duration);
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('unlink', async (p) => {
        opts?.msgs?.onUnlink(p);
        await this.handleChange(p);
      });
      watcher.on('error', (err) => {
        opts?.msgs?.onError(err);
        reject(err);
      });
    });
  }

  private async handleChange(filePath: string): Promise<OnComponentEventResult[]> {
    try {
      if (filePath.endsWith(BIT_MAP)) {
        const buildResults = await this.handleBitmapChanges();
        this.completeWatch();
        return buildResults;
      }
      const componentId = await this.getComponentIdAndClearItsCache(filePath);
      if (!componentId) {
        logger.debug(`file ${filePath} is not part of any component, ignoring it`);
        return this.completeWatch();
      }

      const buildResults = await this.executeWatchOperationsOnComponent(componentId);
      this.completeWatch();
      return buildResults;
    } catch (err) {
      const msg = `watcher found an error while handling ${filePath}`;
      logger.error(msg, err);
      logger.console(`${msg}, ${err.message}`);
      return [];
    }
  }

  /**
   * if .bitmap has change, it's possible that a new component has added. trigger onComponentAdd.
   */
  private async handleBitmapChanges(): Promise<OnComponentEventResult[]> {
    const previewsTrackDirs = { ...this.trackDirs };
    await this.workspace._reloadConsumer();
    await this.setTrackDirs();
    const newDirs: string[] = R.difference(Object.keys(this.trackDirs), Object.keys(previewsTrackDirs));
    const removedDirs: string[] = R.difference(Object.keys(previewsTrackDirs), Object.keys(this.trackDirs));
    const results: OnComponentEventResult[] = [];
    if (newDirs.length) {
      this.fsWatcher.add(newDirs);
      const addResults = await mapSeries(newDirs, (dir) =>
        this.executeWatchOperationsOnComponent(this.trackDirs[dir], false)
      );
      results.push(...R.flatten(addResults));
    }
    if (removedDirs.length) {
      await this.fsWatcher.unwatch(removedDirs);
      await mapSeries(removedDirs, (dir) => this.executeWatchOperationsOnRemove(previewsTrackDirs[dir]));
    }
    return results;
  }

  private async executeWatchOperationsOnRemove(componentId: ComponentID) {
    logger.debug(`running OnComponentRemove hook for ${chalk.bold(componentId.toString())}`);
    this.pubsub.pub(WorkspaceAspect.id, this.creatOnComponentRemovedEvent(componentId.toString()));
    await this.workspace.triggerOnComponentRemove(componentId);
  }

  private async executeWatchOperationsOnComponent(
    componentId: ComponentID,
    isChange = true
  ): Promise<OnComponentEventResult[]> {
    if (this.isComponentWatchedExternally(componentId)) {
      // update capsule, once done, it automatically triggers the external watcher
      await this.workspace.get(componentId);
      return [];
    }
    const idStr = componentId.toString();

    if (isChange) {
      logger.debug(`running OnComponentChange hook for ${chalk.bold(idStr)}`);
      this.pubsub.pub(WorkspaceAspect.id, this.creatOnComponentChangeEvent(idStr, 'OnComponentChange'));
    } else {
      logger.debug(`running OnComponentAdd hook for ${chalk.bold(idStr)}`);
      this.pubsub.pub(WorkspaceAspect.id, this.creatOnComponentAddEvent(idStr, 'OnComponentAdd'));
    }

    let buildResults: OnComponentEventResult[];
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
    return [];
  }

  private creatOnComponentRemovedEvent(idStr) {
    return new OnComponentRemovedEvent(Date.now(), idStr);
  }

  private creatOnComponentChangeEvent(idStr, hook) {
    return new OnComponentChangeEvent(Date.now(), idStr, hook);
  }

  private creatOnComponentAddEvent(idStr, hook) {
    return new OnComponentAddEvent(Date.now(), idStr, hook);
  }

  private completeWatch() {
    loader.stop();
    return [];
  }

  private isComponentWatchedExternally(componentId: ComponentID) {
    const watcherData = this.multipleWatchers.find((m) => m.componentIds.find((id) => id.isEqual(componentId._legacy)));
    if (watcherData) {
      logger.debug(`${componentId.toString()} is watched by ${watcherData.compilerId.toString()}`);
      return true;
    }
    return false;
  }

  /**
   * if a file was added/remove, once the component is loaded, it changes .bitmap, and then the
   * entire cache is invalidated and the consumer is reloaded.
   * when a file just changed, no need to reload the consumer, it is enough to just delete the
   * component from the cache (both, workspace and consumer)
   */
  private async getComponentIdAndClearItsCache(filePath: string): Promise<ComponentID | null> {
    const relativeFile = pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(filePath));
    const trackDir = this.findTrackDirByFilePathRecursively(relativeFile);
    if (!trackDir) {
      // the file is not part of any component. If it was a new component, or a new file of
      // existing component, then, handleBitmapChanges() should deal with it.
      return null;
    }
    const componentId = this.trackDirs[trackDir];
    this.workspace.clearComponentCache(componentId);
    const component = await this.workspace.get(componentId);
    const componentMap: ComponentMap = component.state._consumer.componentMap;
    if (componentMap.getFilesRelativeToConsumer().find((p) => p === relativeFile)) {
      return componentId;
    }
    // the file is inside the component dir but it's ignored. (e.g. it's in IGNORE_LIST)
    return null;
  }

  private findTrackDirByFilePathRecursively(filePath: string): string | null {
    if (this.trackDirs[filePath]) return filePath;
    const parentDir = dirname(filePath);
    if (parentDir === filePath) return null;
    return this.findTrackDirByFilePathRecursively(parentDir);
  }

  private async createWatcher() {
    const pathsToWatch = await this.getPathsToWatch();
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

  async setTrackDirs() {
    this.trackDirs = {};
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents([
      COMPONENT_ORIGINS.AUTHORED,
      COMPONENT_ORIGINS.IMPORTED,
    ]);
    await Promise.all(
      componentsFromBitMap.map(async (componentMap) => {
        const bitId = componentMap.id;
        const trackDir = componentMap.getTrackDir();
        if (!trackDir) throw new Error(`${bitId.toString()} has no rootDir, which is invalid in Harmony`);
        const componentId = await this.workspace.resolveComponentId(bitId);
        this.trackDirs[trackDir] = componentId;
      })
    );
  }

  private async getPathsToWatch(): Promise<string[]> {
    await this.setTrackDirs();
    const paths = [...Object.keys(this.trackDirs), BIT_MAP];
    const pathsAbsolute = paths.map((dir) => this.consumer.toAbsolutePath(dir));
    return pathsAbsolute;
  }
}
