import { PubsubMain } from '@teambit/pubsub';
import { dirname, sep } from 'path';
import { difference } from 'lodash';
import { ComponentID } from '@teambit/component';
import { BitId } from '@teambit/legacy-bit-id';
import loader from '@teambit/legacy/dist/cli/loader';
import { BIT_MAP } from '@teambit/legacy/dist/constants';
import { Consumer } from '@teambit/legacy/dist/consumer';
import logger from '@teambit/legacy/dist/logger/logger';
import { pathNormalizeToLinux } from '@teambit/legacy/dist/utils';
import mapSeries from 'p-map-series';
import chalk from 'chalk';
import { ChildProcess } from 'child_process';
import chokidar, { FSWatcher } from 'chokidar';
import ComponentMap from '@teambit/legacy/dist/consumer/bit-map/component-map';
import { PathLinux, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import { CompilationInitiator } from '@teambit/compiler';
import { WorkspaceAspect } from '../';
import { OnComponentChangeEvent, OnComponentAddEvent, OnComponentRemovedEvent } from '../events';
import { Workspace } from '../workspace';
import { OnComponentEventResult } from '../on-component-events';
import { CheckTypes } from './check-types';
import { WatchQueue } from './watch-queue';

export type WatcherProcessData = { watchProcess: ChildProcess; compilerId: BitId; componentIds: BitId[] };

export type EventMessages = {
  onAll: Function;
  onStart: Function;
  onReady: Function;
  onChange: Function;
  onAdd: Function;
  onUnlink: Function;
  onError: Function;
};

export type WatchOptions = {
  msgs?: EventMessages;
  initiator?: CompilationInitiator;
  verbose?: boolean; // print watch events to the console. (also ts-server events if spawnTSServer is true)
  spawnTSServer?: boolean; // needed for check types and extract API/docs.
  checkTypes?: CheckTypes; // if enabled, the spawnTSServer becomes true.
  preCompile?: boolean; // whether compile all components before start watching
};

const DEBOUNCE_WAIT_MS = 100;

export class Watcher {
  private fsWatcher: FSWatcher;
  private changedFilesPerComponent: { [componentId: string]: string[] } = {};
  private watchQueue = new WatchQueue();
  private bitMapChangesInProgress = false;
  constructor(
    private workspace: Workspace,
    private pubsub: PubsubMain,
    private trackDirs: { [dir: PathLinux]: ComponentID } = {},
    private verbose = false,
    private multipleWatchers: WatcherProcessData[] = []
  ) {}

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async watchAll(opts: WatchOptions) {
    const { msgs, ...watchOpts } = opts;
    // TODO: run build in the beginning of process (it's work like this in other envs)
    const pathsToWatch = await this.getPathsToWatch();
    const componentIds = Object.values(this.trackDirs);
    await this.workspace.triggerOnPreWatch(componentIds, watchOpts);
    await this.createWatcher(pathsToWatch);
    const watcher = this.fsWatcher;
    msgs?.onStart(this.workspace);

    return new Promise((resolve, reject) => {
      // prefix your command with "BIT_LOG=*" to see all watch events
      if (process.env.BIT_LOG) {
        // @ts-ignore
        if (msgs?.onAll) watcher.on('all', msgs?.onAll);
      }
      watcher.on('ready', () => {
        msgs?.onReady(this.workspace, this.trackDirs, this.verbose);
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('change', async (filePath) => {
        const startTime = new Date().getTime();
        const { files, results, debounced, failureMsg } = await this.handleChange(filePath, opts?.initiator);
        if (debounced) {
          return;
        }
        const duration = new Date().getTime() - startTime;
        msgs?.onChange(files, results, this.verbose, duration, failureMsg);
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('add', async (filePath) => {
        const startTime = new Date().getTime();
        const { files, results, debounced, failureMsg } = await this.handleChange(filePath, opts?.initiator);
        if (debounced) {
          return;
        }
        const duration = new Date().getTime() - startTime;
        msgs?.onAdd(files, results, this.verbose, duration, failureMsg);
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('unlink', async (p) => {
        msgs?.onUnlink(p);
        await this.handleChange(p);
      });
      watcher.on('error', (err) => {
        msgs?.onError(err);
        reject(err);
      });
    });
  }

  /**
   * *** DEBOUNCING ***
   * some actions trigger multiple files changes at (almost) the same time. e.g. "git pull".
   * this causes some performance and instability issues. a debouncing mechanism was implemented to help with this.
   * the way how it works is that the first file of the same component starts the execution with a delay (e.g. 200ms).
   * if, in the meanwhile, another file of the same component was changed, it won't start a new execution, instead,
   * it'll only add the file to `this.changedFilesPerComponent` prop.
   * once the execution starts, it'll delete this component-id from the `this.changedFilesPerComponent` array,
   * indicating the next file-change to start a new execution.
   *
   * implementation wise, `lodash.debounce` doesn't help here, because:
   * A) it doesn't return the results, unless "leading" option is true. here, it must be false, otherwise, it'll start
   * the execution immediately.
   * B) it debounces the method regardless the param passes to it. so it'll disregard the component-id and will delay
   * other components undesirably.
   *
   * *** QUEUE ***
   * the debouncing helps to not execute the same component multiple times concurrently. however, multiple components
   * and .bitmap changes execution can still be processed concurrently.
   * the following example explains why this is an issue.
   * compA is changed in the .bitmap file from version 0.0.1 to 0.0.2. its files were changed as well.
   * all these changes get pulled at the same time by "git pull", as a result, the execution of compA and the .bitmap
   * happen at the same time.
   * during the execution of compA, the component id is parsed as compA@0.0.1, later, it asks for the Workspace for this
   * id. while the workspace is looking for this id, the .bitmap execution reloaded the consumer and changed all versions.
   * after this change, the workspace doesn't have this id anymore, which will trigger an error.
   * to ensure this won't happen, we keep a flag to indicate whether the .bitmap execution is running, and if so, all
   * other executions are paused until the queue is empty (this is done by awaiting for queue.onIdle).
   * once the queue is empty, we know the .bitmap process was done and the workspace has all new ids.
   * in the example above, at this stage, the id will be resolved to compA@0.0.2.
   * one more thing, the queue is configured to have concurrency of 1. to make sure two components are not processed at
   * the same time. (the same way is done when loading all components from the filesystem/scope).
   * this way we can also ensure that if compA was started before the .bitmap execution, it will complete before the
   * .bitmap execution starts.
   */
  private async handleChange(
    filePath: string,
    initiator?: CompilationInitiator
  ): Promise<{
    results: OnComponentEventResult[];
    files?: string[];
    failureMsg?: string;
    debounced?: boolean;
  }> {
    try {
      if (filePath.endsWith(BIT_MAP)) {
        this.bitMapChangesInProgress = true;
        const buildResults = await this.watchQueue.add(() => this.handleBitmapChanges());
        this.bitMapChangesInProgress = false;
        loader.stop();
        return { results: buildResults, files: [filePath] };
      }
      if (this.bitMapChangesInProgress) {
        await this.watchQueue.onIdle();
      }
      const componentId = this.getComponentIdByPath(filePath);
      if (!componentId) {
        const failureMsg = `file ${filePath} is not part of any component, ignoring it`;
        logger.debug(failureMsg);
        loader.stop();
        return { results: [], files: [filePath], failureMsg };
      }
      const compIdStr = componentId.toString();
      if (this.changedFilesPerComponent[compIdStr]) {
        this.changedFilesPerComponent[compIdStr].push(filePath);
        loader.stop();
        return { results: [], debounced: true };
      }
      this.changedFilesPerComponent[compIdStr] = [filePath];
      await this.sleep(DEBOUNCE_WAIT_MS);
      const files = this.changedFilesPerComponent[compIdStr];
      delete this.changedFilesPerComponent[compIdStr];

      const buildResults = await this.watchQueue.add(() => this.triggerCompChanges(componentId, files, initiator));
      const failureMsg = buildResults.length
        ? undefined
        : `files ${files.join(', ')} are inside the component ${compIdStr} but configured to be ignored`;
      loader.stop();
      return { results: buildResults, files, failureMsg };
    } catch (err: any) {
      const msg = `watcher found an error while handling ${filePath}`;
      logger.error(msg, err);
      logger.console(`${msg}, ${err.message}`);
      loader.stop();
      return { results: [], files: [filePath], failureMsg: err.message };
    }
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * if a file was added/remove, once the component is loaded, it changes .bitmap, and then the
   * entire cache is invalidated and the consumer is reloaded.
   * when a file just changed, no need to reload the consumer, it is enough to just delete the
   * component from the cache (both, workspace and consumer)
   */
  private async triggerCompChanges(
    componentId: ComponentID,
    files: string[],
    initiator?: CompilationInitiator
  ): Promise<OnComponentEventResult[]> {
    let updatedComponentId: ComponentID | undefined = componentId;
    if (!(await this.workspace.hasId(componentId))) {
      // bitmap has changed meanwhile, which triggered `handleBitmapChanges`, which re-loaded consumer and updated versions
      // so the original componentId might not be in the workspace now, and we need to find the updated one
      const ids = await this.workspace.listIds();
      updatedComponentId = ids.find((id) => id.isEqual(componentId, { ignoreVersion: true }));
      if (!updatedComponentId) {
        // the component was removed
        return [];
      }
    }
    this.workspace.clearComponentCache(updatedComponentId);
    const component = await this.workspace.get(updatedComponentId);
    const componentMap: ComponentMap = component.state._consumer.componentMap;
    if (!componentMap) {
      throw new Error(
        `unable to find componentMap for ${updatedComponentId.toString()}, make sure this component is in .bitmap`
      );
    }
    const compFiles = files.filter((filePath) => {
      const relativeFile = this.getRelativePathLinux(filePath);
      const isCompFile = Boolean(componentMap.getFilesRelativeToConsumer().find((p) => p === relativeFile));
      if (!isCompFile) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        logger.debug(
          `file ${filePath} is inside the component ${updatedComponentId!.toString()} but configured to be ignored`
        );
      }
      return isCompFile;
    });
    if (!compFiles.length) {
      return [];
    }
    const buildResults = await this.executeWatchOperationsOnComponent(updatedComponentId, compFiles, true, initiator);
    return buildResults;
  }

  /**
   * if .bitmap changed, it's possible that a new component has been added. trigger onComponentAdd.
   */
  private async handleBitmapChanges(): Promise<OnComponentEventResult[]> {
    const previewsTrackDirs = { ...this.trackDirs };
    await this.workspace._reloadConsumer();
    await this.setTrackDirs();
    const newDirs: string[] = difference(Object.keys(this.trackDirs), Object.keys(previewsTrackDirs));
    const removedDirs: string[] = difference(Object.keys(previewsTrackDirs), Object.keys(this.trackDirs));
    const results: OnComponentEventResult[] = [];
    if (newDirs.length) {
      this.fsWatcher.add(newDirs);
      const addResults = await mapSeries(newDirs, async (dir) =>
        this.executeWatchOperationsOnComponent(this.trackDirs[dir], [], false)
      );
      results.push(...addResults.flat());
      await this.workspace.triggerOnMultipleComponentsAdd();
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
    files: string[],
    isChange = true,
    initiator?: CompilationInitiator
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
        ? await this.workspace.triggerOnComponentChange(componentId, files, initiator)
        : await this.workspace.triggerOnComponentAdd(componentId);
    } catch (err: any) {
      // do not exit the watch process on errors, just print them
      const msg = `found an issue during onComponentChange or onComponentAdd hooks`;
      logger.error(msg, err);
      logger.console(`\n${msg}: ${err.message || err}`);
      return [];
    }
    return buildResults;
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

  private isComponentWatchedExternally(componentId: ComponentID) {
    const watcherData = this.multipleWatchers.find((m) => m.componentIds.find((id) => id.isEqual(componentId._legacy)));
    if (watcherData) {
      logger.debug(`${componentId.toString()} is watched by ${watcherData.compilerId.toString()}`);
      return true;
    }
    return false;
  }

  private getComponentIdByPath(filePath: string): ComponentID | null {
    const relativeFile = this.getRelativePathLinux(filePath);
    const trackDir = this.findTrackDirByFilePathRecursively(relativeFile);
    if (!trackDir) {
      // the file is not part of any component. If it was a new component, or a new file of
      // existing component, then, handleBitmapChanges() should deal with it.
      return null;
    }
    return this.trackDirs[trackDir];
  }

  private getRelativePathLinux(filePath: string) {
    return pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(filePath));
  }

  private findTrackDirByFilePathRecursively(filePath: string): string | null {
    if (this.trackDirs[filePath]) return filePath;
    const parentDir = dirname(filePath);
    if (parentDir === filePath) return null;
    return this.findTrackDirByFilePathRecursively(parentDir);
  }

  private async createWatcher(pathsToWatch: string[]) {
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
        if (path.includes(`${sep}node_modules${sep}`) || path.includes(`${sep}package.json`)) {
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
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    await Promise.all(
      componentsFromBitMap.map(async (componentMap) => {
        const bitId = componentMap.id;
        const rootDir = componentMap.getRootDir();
        if (!rootDir) throw new Error(`${bitId.toString()} has no rootDir, which is invalid in Harmony`);
        const componentId = await this.workspace.resolveComponentId(bitId);
        this.trackDirs[rootDir] = componentId;
      })
    );
  }

  private async getPathsToWatch(): Promise<PathOsBasedAbsolute[]> {
    await this.setTrackDirs();
    const paths = [...Object.keys(this.trackDirs), BIT_MAP];
    const pathsAbsolute = paths.map((dir) => this.consumer.toAbsolutePath(dir));
    return pathsAbsolute;
  }
}
