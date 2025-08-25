import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { WatchOptions as ChokidarWatchOptions } from 'chokidar';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { ComponentID } from '@teambit/component-id';
import type { IpcEventsMain } from '@teambit/ipc-events';
import { IpcEventsAspect } from '@teambit/ipc-events';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { PubsubMain } from '@teambit/pubsub';
import { PubsubAspect } from '@teambit/pubsub';
import { CFG_WATCH_USE_POLLING } from '@teambit/legacy.constants';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import pMapSeries from 'p-map-series';
import { WatchCommand } from './watch.cmd';
import type { EventMessages, WatchOptions } from './watcher';
import { Watcher } from './watcher';
import { WatcherAspect } from './watcher.aspect';
import type { ConfigStoreMain } from '@teambit/config-store';
import { ConfigStoreAspect } from '@teambit/config-store';

export type OnPreWatch = (componentIds: ComponentID[], watchOpts: WatchOptions) => Promise<void>;
export type OnPreWatchSlot = SlotRegistry<OnPreWatch>;

export class WatcherMain {
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private pubsub: PubsubMain,
    private onPreWatchSlot: OnPreWatchSlot,
    readonly ipcEvents: IpcEventsMain,
    readonly logger: Logger,
    readonly configStore: ConfigStoreMain
  ) {}

  async watch(opts: WatchOptions, msgs?: EventMessages) {
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (opts.preImport) {
      await this.workspace.importObjectsIfOutdatedAgainstBitmap();
    }
    const watcher = new Watcher(this.workspace, this.pubsub, this, opts, msgs);
    await watcher.watch();
  }

  async getChokidarWatchOptions(): Promise<ChokidarWatchOptions> {
    const usePollingConf = this.configStore.getConfig(CFG_WATCH_USE_POLLING);
    const usePolling = usePollingConf === 'true';
    return {
      ignoreInitial: true,
      persistent: true,
      usePolling,
    };
  }

  async watchScopeInternalFiles() {
    const chokidarOpts = await this.getChokidarWatchOptions();
    await this.scope.watchScopeInternalFiles(chokidarOpts);
  }

  async triggerOnPreWatch(componentIds: ComponentID[], watchOpts: WatchOptions) {
    const preWatchFunctions = this.onPreWatchSlot.values();
    await pMapSeries(preWatchFunctions, async (func) => {
      await func(componentIds, watchOpts);
    });
  }

  registerOnPreWatch(onPreWatchFunc: OnPreWatch) {
    this.onPreWatchSlot.register(onPreWatchFunc);
    return this;
  }

  static slots = [Slot.withType<OnPreWatch>()];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    ScopeAspect,
    PubsubAspect,
    LoggerAspect,
    IpcEventsAspect,
    ConfigStoreAspect,
  ];
  static runtime = MainRuntime;

  static async provider(
    [cli, workspace, scope, pubsub, loggerMain, ipcEvents, configStore]: [
      CLIMain,
      Workspace,
      ScopeMain,
      PubsubMain,
      LoggerMain,
      IpcEventsMain,
      ConfigStoreMain,
    ],
    _,
    [onPreWatchSlot]: [OnPreWatchSlot]
  ) {
    const logger = loggerMain.createLogger(WatcherAspect.id);
    const watcherMain = new WatcherMain(workspace, scope, pubsub, onPreWatchSlot, ipcEvents, logger, configStore);
    const watchCmd = new WatchCommand(logger, watcherMain);
    cli.register(watchCmd);
    return watcherMain;
  }
}

WatcherAspect.addRuntime(WatcherMain);

export default WatcherMain;
