import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { SlotRegistry, Slot } from '@teambit/harmony';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { PubsubAspect, PubsubMain } from '@teambit/pubsub';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import pMapSeries from 'p-map-series';
import { WatchCommand } from './watch.cmd';
import { Watcher, WatchOptions } from './watcher';
import { WatcherAspect } from './watcher.aspect';

export type OnPreWatch = (components: Component[], watchOpts: WatchOptions) => Promise<void>;
export type OnPreWatchSlot = SlotRegistry<OnPreWatch>;

export class WatcherMain {
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private pubsub: PubsubMain,
    private onPreWatchSlot: OnPreWatchSlot
  ) {}

  async watch(opts: WatchOptions) {
    const watcher = new Watcher(this.workspace, this.pubsub, this);
    await watcher.watchAll(opts);
  }

  async watchScopeInternalFiles() {
    await this.scope.watchScopeInternalFiles();
  }

  async triggerOnPreWatch(componentIds: ComponentID[], watchOpts: WatchOptions) {
    const components = await this.workspace.getMany(componentIds);
    const preWatchFunctions = this.onPreWatchSlot.values();
    await pMapSeries(preWatchFunctions, async (func) => {
      await func(components, watchOpts);
    });
  }

  registerOnPreWatch(onPreWatchFunc: OnPreWatch) {
    this.onPreWatchSlot.register(onPreWatchFunc);
    return this;
  }

  static slots = [Slot.withType<OnPreWatch>()];
  static dependencies = [CLIAspect, WorkspaceAspect, ScopeAspect, PubsubAspect, LoggerAspect];
  static runtime = MainRuntime;

  static async provider(
    [cli, workspace, scope, pubsub, loggerMain]: [CLIMain, Workspace, ScopeMain, PubsubMain, LoggerMain],
    _,
    [onPreWatchSlot]: [OnPreWatchSlot]
  ) {
    const logger = loggerMain.createLogger(WatcherAspect.id);
    const watcherMain = new WatcherMain(workspace, scope, pubsub, onPreWatchSlot);
    const watchCmd = new WatchCommand(pubsub, logger, watcherMain);
    cli.register(watchCmd);
    return watcherMain;
  }
}

WatcherAspect.addRuntime(WatcherMain);

export default WatcherMain;
