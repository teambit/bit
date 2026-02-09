import type { PubsubMain } from '@teambit/pubsub';
import fs from 'fs-extra';
import { dirname, basename, join, sep } from 'path';
import { compact, difference, partition } from 'lodash';
import type { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BIT_MAP, WORKSPACE_JSONC } from '@teambit/legacy.constants';
import type { Consumer } from '@teambit/legacy.consumer';
import { logger } from '@teambit/legacy.logger';
import type { PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import mapSeries from 'p-map-series';
import chalk from 'chalk';
import type { ChildProcess } from 'child_process';
import { UNMERGED_FILENAME } from '@teambit/legacy.scope';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { ComponentMap } from '@teambit/legacy.bit-map';
import type { Workspace, OnComponentEventResult } from '@teambit/workspace';
import {
  WorkspaceAspect,
  OnComponentChangeEvent,
  OnComponentAddEvent,
  OnComponentRemovedEvent,
} from '@teambit/workspace';
import type { CheckTypes } from './check-types';
import type { WatcherMain } from './watcher.main.runtime';
import { WatchQueue } from './watch-queue';
import type { Logger } from '@teambit/logger';
import type { Event, Options as ParcelWatcherOptions } from '@parcel/watcher';
import ParcelWatcher from '@parcel/watcher';
import { spawnSync } from 'child_process';
import { sendEventsToClients } from '@teambit/harmony.modules.send-server-sent-events';
import { getOrCreateWatcherConnection } from './watcher-daemon';
import type { WatcherDaemon, WatcherClient, WatcherError } from './watcher-daemon';
import { formatFSEventsErrorMessage } from './fsevents-error';

export type WatcherProcessData = { watchProcess: ChildProcess; compilerId: ComponentID; componentIds: ComponentID[] };

export type EventMessages = {
  onAll: Function;
  onStart: Function;
  onReady: Function;
  onChange: OnFileEventFunc;
  onAdd: OnFileEventFunc;
  onUnlink: OnFileEventFunc;
  onError: Function;
};

export type OnFileEventFunc = (
  filePaths: string[],
  buildResults: OnComponentEventResult[],
  verbose: boolean,
  duration: number,
  failureMsg?: string
) => void;

export type WatchOptions = {
  initiator?: any; // the real type is CompilationInitiator, however it creates a circular dependency with the compiler aspect.
  verbose?: boolean; // print watch events to the console. (also ts-server events if spawnTSServer is true)
  spawnTSServer?: boolean; // needed for check types and extract API/docs.
  checkTypes?: CheckTypes; // if enabled, the spawnTSServer becomes true.
  preCompile?: boolean; // whether compile all components before start watching
  compile?: boolean; // whether compile modified/added components during watch process
  import?: boolean; // whether import objects during watch when .bitmap got version changes
  preImport?: boolean; // whether import objects before starting the watch process in case .bitmap is more updated than local scope.
  generateTypes?: boolean; // whether generate d.ts files for typescript files during watch process (hurts performance)
  trigger?: ComponentID; // trigger onComponentChange for the specified component-id. helpful when this comp must be a bundle, and needs to be recompile on any dep change.
};

export type RootDirs = { [dir: PathLinux]: ComponentID };

type WatcherType = 'chokidar' | 'parcel';

const DEBOUNCE_WAIT_MS = 100;
const DROP_ERROR_DEBOUNCE_MS = 300; // Wait 300ms after last drop error before recovering
type PathLinux = string; // ts fails when importing it from @teambit/legacy/dist/utils/path.

export class Watcher {
  private watcherType: WatcherType = 'parcel';
  private chokidarWatcher: FSWatcher;
  private changedFilesPerComponent: { [componentId: string]: string[] } = {};
  private watchQueue = new WatchQueue();
  private bitMapChangesInProgress = false;
  private ipcEventsDir: PathOsBasedAbsolute;
  private rootDirs: RootDirs = {};
  private verbose = false;
  private multipleWatchers: WatcherProcessData[] = [];
  private logger: Logger;
  private workspacePathLinux: string;
  // Snapshot-based recovery for FSEvents buffer overflow
  private snapshotPath: PathOsBasedAbsolute;
  private dropErrorDebounceTimer: NodeJS.Timeout | null = null;
  private dropErrorCount = 0;
  private isRecoveringFromSnapshot = false;
  // Shared watcher daemon/client
  private watcherDaemon: WatcherDaemon | null = null;
  private watcherClient: WatcherClient | null = null;
  private isDaemon = false;
  // Parcel watcher subscription for cleanup
  private parcelSubscription: { unsubscribe: () => Promise<void> } | null = null;
  // Signal handlers for cleanup (to avoid accumulation)
  private signalCleanupHandler: (() => void) | null = null;
  // Cached Watchman availability (checked once per process lifetime)
  private watchmanAvailable: boolean | null = null;
  constructor(
    private workspace: Workspace,
    private pubsub: PubsubMain,
    private watcherMain: WatcherMain,
    private options: WatchOptions,
    private msgs?: EventMessages
  ) {
    this.ipcEventsDir = this.watcherMain.ipcEvents.eventsDir;
    this.verbose = this.options.verbose || false;
    this.logger = this.watcherMain.logger;
    this.workspacePathLinux = pathNormalizeToLinux(this.workspace.path);
    this.snapshotPath = join(this.workspace.scope.path, 'watcher-snapshot.txt');

    if (process.env.BIT_WATCHER_USE_CHOKIDAR === 'true' || process.env.BIT_WATCHER_USE_CHOKIDAR === '1') {
      this.watcherType = 'chokidar';
    }
  }

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  private getParcelIgnorePatterns(): string[] {
    return [
      '**/node_modules/**',
      '**/package.json',
      `**/${this.workspace.scope.path}/cache/**`,
      `**/${this.workspace.scope.path}/tmp/**`,
      `**/${this.workspace.scope.path}/objects/**`,
    ];
  }

  /**
   * Get Parcel watcher options, preferring Watchman on macOS when available.
   * On macOS, FSEvents is the default but has a system-wide limit of ~500 streams.
   * Watchman is a single-daemon solution that avoids this limit.
   */
  private getParcelWatcherOptions(): ParcelWatcherOptions {
    const options: ParcelWatcherOptions = {
      ignore: this.getParcelIgnorePatterns(),
    };

    // On macOS, prefer Watchman if available to avoid FSEvents stream limit
    if (process.platform === 'darwin') {
      if (this.isWatchmanAvailable()) {
        options.backend = 'watchman';
        this.logger.debug('Using Watchman backend for file watching');
      } else {
        this.logger.debug('Using FSEvents backend for file watching (Watchman not available)');
      }
    }

    return options;
  }

  /**
   * Check if Watchman is installed.
   * Result is cached to avoid repeated executions.
   */
  private isWatchmanAvailable(): boolean {
    if (this.watchmanAvailable !== null) {
      return this.watchmanAvailable;
    }
    try {
      // Use spawnSync with shell: false (default) for security - prevents command injection
      const result = spawnSync('watchman', ['version'], { stdio: 'ignore', timeout: 5000 });
      // Check for spawn errors (e.g., command not found) or non-zero exit status
      this.watchmanAvailable = !result.error && result.status === 0;
    } catch {
      this.watchmanAvailable = false;
    }
    return this.watchmanAvailable;
  }

  /**
   * Ensure .watchmanconfig exists when using Watchman without a .git directory.
   * Watchman places cookie files (used for sync) in .git, .hg, or .svn directories.
   * Without these, cookies appear in the workspace root. This config tells Watchman
   * to use .bit directory instead, keeping cookie files hidden.
   */
  private async ensureWatchmanConfig(): Promise<void> {
    // Only needed if no .git directory (Watchman uses .git for cookies by default)
    const gitPath = join(this.workspace.path, '.git');
    const gitExists = await fs.pathExists(gitPath);
    if (gitExists) {
      return;
    }

    const configPath = join(this.workspace.path, '.watchmanconfig');
    const scopeDirName = basename(this.workspace.scope.path); // typically ".bit"
    const desiredIgnoreVcs = ['.git', '.hg', '.svn', scopeDirName];

    try {
      const existingContent = await fs.readFile(configPath, 'utf-8');
      const existingConfig = JSON.parse(existingContent);

      // Check if scopeDirName already in ignore_vcs
      if (existingConfig.ignore_vcs?.includes(scopeDirName)) {
        return; // Already configured
      }

      // Merge with existing config
      existingConfig.ignore_vcs = existingConfig.ignore_vcs
        ? [...new Set([...existingConfig.ignore_vcs, scopeDirName])]
        : desiredIgnoreVcs;

      await fs.writeFile(configPath, JSON.stringify(existingConfig, null, 2) + '\n');
      this.logger.debug(`Updated .watchmanconfig to include ${scopeDirName} in ignore_vcs`);
    } catch (err: any) {
      // File doesn't exist or is invalid JSON - create new config
      // For other errors (permissions, disk space), log and attempt to create anyway
      const isExpectedError = err.code === 'ENOENT' || err instanceof SyntaxError;
      if (!isExpectedError) {
        this.logger.debug(`Unexpected error reading .watchmanconfig: ${err.message}, creating new file`);
      }
      await fs.writeFile(configPath, JSON.stringify({ ignore_vcs: desiredIgnoreVcs }, null, 2) + '\n');
      this.logger.debug(`Created .watchmanconfig with ${scopeDirName} in ignore_vcs`);
    }
  }

  async watch() {
    await this.setRootDirs();
    const componentIds = Object.values(this.rootDirs);
    await this.watcherMain.triggerOnPreWatch(componentIds, this.options);
    await this.watcherMain.watchScopeInternalFiles();
    this.watcherType === 'parcel' ? await this.watchParcel() : await this.watchChokidar();
  }

  private async watchParcel() {
    this.msgs?.onStart(this.workspace);

    // Ensure .watchmanconfig exists before starting watch (for cookie file placement in .bit)
    // Must be done before Parcel watcher starts, as Watchman only reads config at watch start
    if (process.platform === 'darwin' && this.isWatchmanAvailable()) {
      await this.ensureWatchmanConfig();
    }

    // Use shared watcher daemon pattern to avoid FSEvents limit on macOS
    // FSEvents has a system-wide limit on concurrent watchers, which causes
    // "Error starting FSEvents stream" when multiple bit commands run watchers.
    // This is only an issue on macOS - other platforms don't have this limitation.
    const isMacOS = process.platform === 'darwin';
    const isSharedDisabled = process.env.BIT_WATCHER_NO_SHARED === 'true' || process.env.BIT_WATCHER_NO_SHARED === '1';
    const useSharedWatcher = isMacOS && !isSharedDisabled;

    if (useSharedWatcher) {
      try {
        const connection = await getOrCreateWatcherConnection(this.workspace.scope.path, this.logger);

        if (connection.isDaemon && connection.daemon) {
          // We're the daemon - run the actual Parcel watcher
          this.isDaemon = true;
          this.watcherDaemon = connection.daemon;
          this.logger.debug('Started as watcher daemon');
          await this.startParcelWatcherAsDaemon();
        } else if (connection.client) {
          // We're a client - receive events from the daemon
          this.isDaemon = false;
          this.watcherClient = connection.client;
          this.logger.debug('Connected to existing watcher daemon');
          await this.startAsClient();
        }

        this.msgs?.onReady(this.workspace, this.rootDirs, this.verbose);
        this.logger.clearStatusLine();
        return;
      } catch (err: any) {
        // If shared watcher setup fails, fall back to direct Parcel watcher
        this.logger.debug(`Shared watcher setup failed, falling back to direct watcher: ${err.message}`);
      }
    }

    // Original direct Parcel watcher logic (fallback)
    try {
      await ParcelWatcher.subscribe(this.workspace.path, this.onParcelWatch.bind(this), this.getParcelWatcherOptions());

      // Write initial snapshot for FSEvents buffer overflow recovery
      await this.writeSnapshotIfNeeded();
      this.logger.debug('Initial watcher snapshot created');
    } catch (err: any) {
      if (err.message.includes('Error starting FSEvents stream')) {
        const errorMessage = await formatFSEventsErrorMessage();
        throw new Error(errorMessage);
      }
      throw err;
    }
    this.msgs?.onReady(this.workspace, this.rootDirs, this.verbose);
    this.logger.clearStatusLine();
  }

  /**
   * Start Parcel watcher as the daemon - broadcast events to all clients
   */
  private async startParcelWatcherAsDaemon(): Promise<void> {
    try {
      // Clean up existing subscription if any (e.g., when transitioning from client to daemon)
      if (this.parcelSubscription) {
        await this.parcelSubscription.unsubscribe();
        this.parcelSubscription = null;
      }

      this.parcelSubscription = await ParcelWatcher.subscribe(
        this.workspace.path,
        this.onParcelWatchAsDaemon.bind(this),
        this.getParcelWatcherOptions()
      );

      // Write initial snapshot for FSEvents buffer overflow recovery
      await this.writeSnapshotIfNeeded();
      this.logger.debug('Initial watcher snapshot created (daemon mode)');

      // Setup graceful shutdown
      this.setupDaemonShutdown();
    } catch (err: any) {
      // Clean up daemon on failure
      await this.watcherDaemon?.stop();
      if (err.message.includes('Error starting FSEvents stream')) {
        const errorMessage = await formatFSEventsErrorMessage();
        throw new Error(errorMessage);
      }
      throw err;
    }
  }

  /**
   * Handle Parcel watcher events when running as daemon
   */
  private async onParcelWatchAsDaemon(err: Error | null, allEvents: Event[]) {
    const events = allEvents.filter((event) => !this.shouldIgnoreFromLocalScopeParcel(event.path));

    // Broadcast events to all clients
    if (events.length > 0) {
      this.watcherDaemon?.broadcastEvents(events);
    }

    // Also broadcast errors
    if (err) {
      const isDropError = err.message.includes('Events were dropped');
      this.watcherDaemon?.broadcastError(err.message, isDropError);
    }

    // Process events locally (the daemon is also a watcher)
    await this.onParcelWatch(err, allEvents);
  }

  /**
   * Start as a client receiving events from the daemon
   */
  private async startAsClient(): Promise<void> {
    if (!this.watcherClient) {
      throw new Error('Watcher client not initialized');
    }

    // Handle events from the daemon
    this.watcherClient.onEvents(async (events) => {
      const filteredEvents = events.filter((event) => !this.shouldIgnoreFromLocalScopeParcel(event.path));
      if (filteredEvents.length > 0) {
        const startTime = Date.now();
        await this.processEvents(filteredEvents, startTime);
      }
    });

    // Handle errors from the daemon
    this.watcherClient.onError(async (error: WatcherError) => {
      if (error.isDropError) {
        // The daemon will handle recovery, but we should be aware
        this.logger.debug('Daemon reported FSEvents buffer overflow');
      } else {
        this.msgs?.onError(new Error(error.message));
      }
    });

    // Handle disconnection from the daemon
    this.watcherClient.onDisconnect(async () => {
      this.logger.debug('Disconnected from watcher daemon');

      // Try to become the new daemon or reconnect
      await this.handleDaemonDisconnection();
    });

    // Setup graceful shutdown
    this.setupClientShutdown();
  }

  /**
   * Handle disconnection from the daemon - try to become the new daemon or reconnect
   */
  private async handleDaemonDisconnection(): Promise<void> {
    // Wait a bit for any other client to potentially become the daemon
    await this.sleep(500);

    try {
      const connection = await getOrCreateWatcherConnection(this.workspace.scope.path, this.logger);

      if (connection.isDaemon && connection.daemon) {
        // We became the new daemon
        this.isDaemon = true;
        this.watcherDaemon = connection.daemon;
        this.watcherClient = null;
        this.logger.console(
          chalk.yellow('Previous watcher daemon disconnected. This process is now the watcher daemon.')
        );
        await this.startParcelWatcherAsDaemon();
      } else if (connection.client) {
        // Another process became the daemon, connect to it
        this.watcherClient = connection.client;
        this.logger.debug('Reconnected to new watcher daemon');
        await this.startAsClient();
      }
    } catch (err: any) {
      this.logger.error(`Failed to reconnect after daemon disconnection: ${err.message}`);
      this.msgs?.onError(err);
    }
  }

  /**
   * Remove any existing signal handlers to prevent accumulation.
   * This is important when transitioning between client and daemon modes.
   */
  private removeSignalHandlers(): void {
    if (this.signalCleanupHandler) {
      process.off('SIGINT', this.signalCleanupHandler);
      process.off('SIGTERM', this.signalCleanupHandler);
      this.signalCleanupHandler = null;
    }
  }

  /**
   * Setup graceful shutdown handlers for daemon mode.
   * When SIGINT/SIGTERM is received, we need to:
   * 1. Stop the daemon (cleanup socket, notify clients)
   * 2. Call process.exit() to actually terminate
   *
   * Important: Once you add a handler for SIGINT, Node.js no longer exits automatically.
   * You must call process.exit() explicitly.
   */
  private setupDaemonShutdown(): void {
    // Remove old handlers to prevent accumulation when transitioning modes
    this.removeSignalHandlers();

    let isShuttingDown = false;

    const cleanup = () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      this.logger.debug('Daemon shutting down...');
      // Unsubscribe from Parcel watcher
      this.parcelSubscription?.unsubscribe().catch((err) => {
        this.logger.debug(`Error unsubscribing from Parcel watcher: ${err.message}`);
      });
      // Stop is async but we need to exit - start the cleanup and exit
      // The socket will be cleaned up by the OS when the process exits
      this.watcherDaemon
        ?.stop()
        .catch((err) => {
          this.logger.error(`Error stopping daemon: ${err.message}`);
        })
        .finally(() => {
          process.exit(0);
        });

      // Fallback: if stop() hangs, force exit after 1 second
      setTimeout(() => {
        process.exit(0);
      }, 1000).unref();
    };

    this.signalCleanupHandler = cleanup;
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  /**
   * Setup graceful shutdown handlers for client mode.
   */
  private setupClientShutdown(): void {
    // Remove old handlers to prevent accumulation when transitioning modes
    this.removeSignalHandlers();

    let isShuttingDown = false;

    const cleanup = () => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      this.watcherClient?.disconnect();
      process.exit(0);
    };

    this.signalCleanupHandler = cleanup;
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  private async watchChokidar() {
    await this.createChokidarWatcher();
    const watcher = this.chokidarWatcher;
    const msgs = this.msgs;
    msgs?.onStart(this.workspace);

    return new Promise((resolve, reject) => {
      if (this.verbose) {
        // @ts-ignore
        if (msgs?.onAll) watcher.on('all', msgs.onAll);
      }
      watcher.on('ready', () => {
        msgs?.onReady(this.workspace, this.rootDirs, this.verbose);
        if (this.verbose) {
          const watched = this.chokidarWatcher.getWatched();
          const totalWatched = Object.values(watched).flat().length;
          logger.console(
            `${chalk.bold('the following files are being watched:')}\n${JSON.stringify(watched, null, 2)}`
          );
          logger.console(`\nTotal files being watched: ${chalk.bold(totalWatched.toString())}`);
        }

        this.logger.clearStatusLine();
      });
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      watcher.on('all', async (event, filePath) => {
        if (event !== 'change' && event !== 'add' && event !== 'unlink') return;
        const startTime = new Date().getTime();
        const { files, results, debounced, irrelevant, failureMsg } = await this.handleChange(filePath);
        if (debounced || irrelevant) {
          return;
        }
        const duration = new Date().getTime() - startTime;
        msgs?.onChange(files, results, this.verbose, duration, failureMsg);
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
  private async handleChange(filePath: string): Promise<{
    results: OnComponentEventResult[];
    files: string[];
    failureMsg?: string;
    debounced?: boolean;
    irrelevant?: boolean; // file/dir is not part of any component
  }> {
    try {
      if (filePath.endsWith(BIT_MAP)) {
        this.bitMapChangesInProgress = true;
        const buildResults = await this.watchQueue.add(() => this.handleBitmapChanges());
        this.bitMapChangesInProgress = false;
        this.logger.clearStatusLine();
        return { results: buildResults, files: [filePath] };
      }
      if (this.bitMapChangesInProgress) {
        await this.watchQueue.onIdle();
      }
      if (dirname(filePath) === this.ipcEventsDir) {
        const eventName = basename(filePath);
        if (eventName === 'onNotifySSE') {
          const content = await fs.readFile(filePath, 'utf8');
          this.logger.debug(`Watcher, onNotifySSE ${content}`);
          const parsed = JSON.parse(content);
          sendEventsToClients(parsed.event, parsed);
        } else {
          await this.watcherMain.ipcEvents.triggerGotEvent(eventName as any);
        }
        return { results: [], files: [filePath] };
      }
      if (filePath.endsWith(WORKSPACE_JSONC)) {
        await this.workspace.triggerOnWorkspaceConfigChange();
        return { results: [], files: [filePath] };
      }
      if (filePath.endsWith(UNMERGED_FILENAME)) {
        await this.workspace.clearCache();
        return { results: [], files: [filePath] };
      }
      const componentId = this.getComponentIdByPath(filePath);
      if (!componentId) {
        this.logger.clearStatusLine();
        return { results: [], files: [], irrelevant: true };
      }
      const compIdStr = componentId.toString();
      if (this.changedFilesPerComponent[compIdStr]) {
        this.changedFilesPerComponent[compIdStr].push(filePath);
        this.logger.clearStatusLine();
        return { results: [], files: [], debounced: true };
      }
      this.changedFilesPerComponent[compIdStr] = [filePath];
      await this.sleep(DEBOUNCE_WAIT_MS);
      const files = this.changedFilesPerComponent[compIdStr];
      delete this.changedFilesPerComponent[compIdStr];

      const buildResults = await this.watchQueue.add(() => this.triggerCompChanges(componentId, files));
      const failureMsg = buildResults.length
        ? undefined
        : `files ${files.join(', ')} are inside the component ${compIdStr} but configured to be ignored`;
      this.logger.clearStatusLine();
      return { results: buildResults, files, failureMsg };
    } catch (err: any) {
      const msg = `watcher found an error while handling ${filePath}`;
      logger.error(msg, err);
      logger.console(`${msg}, ${err.message}`);
      this.logger.clearStatusLine();
      return { results: [], files: [filePath], failureMsg: err.message };
    }
  }

  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async triggerCompChanges(
    componentId: ComponentID,
    files: PathOsBasedAbsolute[]
  ): Promise<OnComponentEventResult[]> {
    let updatedComponentId: ComponentID | undefined = componentId;
    if (!this.workspace.hasId(componentId)) {
      // bitmap has changed meanwhile, which triggered `handleBitmapChanges`, which re-loaded consumer and updated versions
      // so the original componentId might not be in the workspace now, and we need to find the updated one
      const ids = this.workspace.listIds();
      updatedComponentId = ids.find((id) => id.isEqual(componentId, { ignoreVersion: true }));
      if (!updatedComponentId) {
        logger.debug(`triggerCompChanges, the component ${componentId.toString()} was probably removed from .bitmap`);
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
    const compFilesRelativeToWorkspace = componentMap.getFilesRelativeToConsumer();
    const [compFiles, nonCompFiles] = partition(files, (filePath) => {
      const relativeFile = this.getRelativePathLinux(filePath);
      return Boolean(compFilesRelativeToWorkspace.find((p) => p === relativeFile));
    });
    // nonCompFiles are either, files that were removed from the filesystem or existing files that are ignored.
    // the compiler takes care of removedFiles differently, e.g. removes dists dir and old symlinks.
    const removedFiles = compact(
      await Promise.all(nonCompFiles.map(async (filePath) => ((await fs.pathExists(filePath)) ? null : filePath)))
    );

    if (!compFiles.length && !removedFiles.length) {
      logger.debug(
        `the following files are part of the component ${componentId.toStringWithoutVersion()} but configured to be ignored:\n${files.join(
          '\n'
        )}'`
      );
      return [];
    }
    this.consumer.bitMap.updateComponentPaths(
      componentId,
      compFiles.map((f) => this.consumer.getPathRelativeToConsumer(f)),
      removedFiles.map((f) => this.consumer.getPathRelativeToConsumer(f))
    );
    const buildResults = await this.executeWatchOperationsOnComponent(
      updatedComponentId,
      compFiles,
      removedFiles,
      true
    );
    if (this.options.trigger && !updatedComponentId.isEqual(this.options.trigger)) {
      await this.workspace.triggerOnComponentChange(this.options.trigger, [], [], this.options);
    }

    return buildResults;
  }

  /**
   * if .bitmap changed, it's possible that a new component has been added. trigger onComponentAdd.
   */
  private async handleBitmapChanges(): Promise<OnComponentEventResult[]> {
    const previewsRootDirs = { ...this.rootDirs };
    const previewsIds = this.consumer.bitMap.getAllBitIds();
    await this.workspace._reloadConsumer();
    await this.setRootDirs();
    await this.importObjectsIfNeeded(previewsIds);
    await this.workspace.triggerOnBitmapChange();
    const newDirs: string[] = difference(Object.keys(this.rootDirs), Object.keys(previewsRootDirs));
    const removedDirs: string[] = difference(Object.keys(previewsRootDirs), Object.keys(this.rootDirs));
    const results: OnComponentEventResult[] = [];
    if (newDirs.length) {
      const addResults = await mapSeries(newDirs, async (dir) =>
        this.executeWatchOperationsOnComponent(this.rootDirs[dir], [], [], false)
      );
      results.push(...addResults.flat());
    }
    if (removedDirs.length) {
      await mapSeries(removedDirs, (dir) => this.executeWatchOperationsOnRemove(previewsRootDirs[dir]));
    }

    return results;
  }

  /**
   * needed when using git.
   * it resolves the following issue - a user is running `git pull` which updates the components and the .bitmap file.
   * because the objects locally are not updated, the .bitmap has new versions that don't exist in the local scope.
   * as soon as the watcher gets an event about a file change, it loads the component which throws
   * ComponentsPendingImport error.
   * to resolve this, we import the new objects as soon as the .bitmap file changes.
   * for performance reasons, we import only when: 1) the .bitmap file has version changes and 2) this new version is
   * not already in the scope.
   */
  private async importObjectsIfNeeded(previewsIds: ComponentIdList) {
    if (!this.options.import) {
      return;
    }
    const currentIds = this.consumer.bitMap.getAllBitIds();
    const hasVersionChanges = currentIds.find((id) => {
      const prevId = previewsIds.searchWithoutVersion(id);
      return prevId && prevId.version !== id.version;
    });
    if (!hasVersionChanges) {
      return;
    }
    const existsInScope = await this.workspace.scope.isComponentInScope(hasVersionChanges);
    if (existsInScope) {
      // the .bitmap change was probably a result of tag/snap/merge, no need to import.
      return;
    }
    if (this.options.verbose) {
      logger.console(
        `Watcher: .bitmap has changed with new versions which do not exist locally, importing the objects...`
      );
    }
    await this.workspace.scope.import(currentIds, {
      useCache: true,
      lane: await this.workspace.getCurrentLaneObject(),
    });
  }

  private async executeWatchOperationsOnRemove(componentId: ComponentID) {
    logger.debug(`running OnComponentRemove hook for ${chalk.bold(componentId.toString())}`);
    this.pubsub.pub(WorkspaceAspect.id, this.createOnComponentRemovedEvent(componentId.toString()));
    await this.workspace.triggerOnComponentRemove(componentId);
  }

  private async executeWatchOperationsOnComponent(
    componentId: ComponentID,
    files: PathOsBasedAbsolute[],
    removedFiles: PathOsBasedAbsolute[] = [],
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
      this.pubsub.pub(WorkspaceAspect.id, this.createOnComponentChangeEvent(idStr, 'OnComponentChange'));
    } else {
      logger.debug(`running OnComponentAdd hook for ${chalk.bold(idStr)}`);
      this.pubsub.pub(WorkspaceAspect.id, this.createOnComponentAddEvent(idStr, 'OnComponentAdd'));
    }

    const buildResults = isChange
      ? await this.workspace.triggerOnComponentChange(componentId, files, removedFiles, this.options)
      : await this.workspace.triggerOnComponentAdd(componentId, this.options);

    return buildResults;
  }

  private createOnComponentRemovedEvent(idStr) {
    return new OnComponentRemovedEvent(Date.now(), idStr);
  }

  private createOnComponentChangeEvent(idStr, hook) {
    return new OnComponentChangeEvent(Date.now(), idStr, hook);
  }

  private createOnComponentAddEvent(idStr, hook) {
    return new OnComponentAddEvent(Date.now(), idStr, hook);
  }

  private isComponentWatchedExternally(componentId: ComponentID) {
    const watcherData = this.multipleWatchers.find((m) => m.componentIds.find((id) => id.isEqual(componentId)));
    if (watcherData) {
      logger.debug(`${componentId.toString()} is watched by ${watcherData.compilerId.toString()}`);
      return true;
    }
    return false;
  }

  private getComponentIdByPath(filePath: string): ComponentID | null {
    const relativeFile = this.getRelativePathLinux(filePath);
    const rootDir = this.findRootDirByFilePathRecursively(relativeFile);
    if (!rootDir) {
      // the file is not part of any component. If it was a new component, or a new file of
      // existing component, then, handleBitmapChanges() should deal with it.
      return null;
    }
    return this.rootDirs[rootDir];
  }

  private getRelativePathLinux(filePath: string) {
    return pathNormalizeToLinux(this.consumer.getPathRelativeToConsumer(filePath));
  }

  private findRootDirByFilePathRecursively(filePath: string): string | null {
    if (this.rootDirs[filePath]) return filePath;
    const parentDir = dirname(filePath);
    if (parentDir === filePath) return null;
    return this.findRootDirByFilePathRecursively(parentDir);
  }

  private shouldIgnoreFromLocalScopeChokidar(pathToCheck: string) {
    if (pathToCheck.startsWith(this.ipcEventsDir) || pathToCheck.endsWith(UNMERGED_FILENAME)) return false;
    const scopePathLinux = pathNormalizeToLinux(this.workspace.scope.path);
    return pathToCheck.startsWith(`${scopePathLinux}/`);
  }

  private shouldIgnoreFromLocalScopeParcel(pathToCheck: string) {
    if (pathToCheck.startsWith(this.ipcEventsDir) || pathToCheck.endsWith(UNMERGED_FILENAME)) return false;
    return pathToCheck.startsWith(this.workspace.scope.path + sep);
  }

  private async createChokidarWatcher() {
    const chokidarOpts = await this.watcherMain.getChokidarWatchOptions();
    // `chokidar` matchers have Bash-parity, so Windows-style backslashes are not supported as separators.
    // (windows-style backslashes are converted to forward slashes)
    chokidarOpts.ignored = [
      '**/node_modules/**',
      '**/package.json',
      this.shouldIgnoreFromLocalScopeChokidar.bind(this),
    ];
    this.chokidarWatcher = chokidar.watch(this.workspace.path, chokidarOpts);
    if (this.verbose) {
      logger.console(
        `${chalk.bold('chokidar.options:\n')} ${JSON.stringify(this.chokidarWatcher.options, undefined, 2)}`
      );
    }
  }

  private async onParcelWatch(err: Error | null, allEvents: Event[]) {
    const events = allEvents.filter((event) => !this.shouldIgnoreFromLocalScopeParcel(event.path));

    if (this.verbose) {
      this.logger.debug(
        `onParcelWatch: ${allEvents.length} events, ${events.length} after filtering, error: ${err?.message || 'none'}`
      );
    }

    const msgs = this.msgs;
    if (this.verbose) {
      if (msgs?.onAll) events.forEach((event) => msgs.onAll(event.type, event.path));
    }

    // Handle FSEvents buffer overflow with debounced snapshot recovery
    if (err?.message.includes('Events were dropped')) {
      // If recovery is already in progress, don't schedule another one
      if (this.isRecoveringFromSnapshot) {
        this.logger.debug('Recovery already in progress, ignoring additional drop error');
        return;
      }

      this.dropErrorCount++;
      this.logger.warn(`⚠️  FSEvents buffer overflow detected (occurrence #${this.dropErrorCount})`);

      // Clear existing timer and schedule new recovery
      if (this.dropErrorDebounceTimer) {
        clearTimeout(this.dropErrorDebounceTimer);
      }

      this.dropErrorDebounceTimer = setTimeout(async () => {
        await this.recoverFromSnapshot();
        this.dropErrorDebounceTimer = null;
      }, DROP_ERROR_DEBOUNCE_MS);

      // Don't process events if we got a drop error - wait for recovery
      return;
    }

    // Handle other errors
    if (err) {
      msgs?.onError(err);
      // Continue processing events even with other errors
    }

    if (!events.length) {
      return;
    }

    const startTime = new Date().getTime();
    await this.processEvents(events, startTime);

    // Write snapshot after successful processing (non-blocking)
    // eslint-disable-next-line promise/no-promise-in-callback
    this.writeSnapshotIfNeeded().catch((writeErr) => {
      this.logger.debug(`Failed to write watcher snapshot: ${writeErr.message}`);
    });
  }

  /**
   * Process a list of file system events through the normal change handling pipeline.
   */
  private async processEvents(events: Event[], startTime: number): Promise<void> {
    await Promise.all(
      events.map(async (event) => {
        const { files, results, debounced, irrelevant, failureMsg } = await this.handleChange(event.path);
        if (debounced || irrelevant) {
          return;
        }
        const duration = new Date().getTime() - startTime;
        this.msgs?.onChange(files, results, this.verbose, duration, failureMsg);
      })
    );
  }

  private async setRootDirs() {
    this.rootDirs = {};
    const componentsFromBitMap = this.consumer.bitMap.getAllComponents();
    componentsFromBitMap.map((componentMap) => {
      const componentId = componentMap.id;
      const rootDir = componentMap.getRootDir();
      this.rootDirs[rootDir] = componentId;
    });
  }

  /**
   * Write a snapshot of the current filesystem state for recovery after FSEvents buffer overflow.
   * This is called after successful event processing.
   */
  private async writeSnapshotIfNeeded(): Promise<void> {
    if (this.watcherType !== 'parcel') {
      return; // Snapshots only work with Parcel watcher
    }

    if (this.isRecoveringFromSnapshot) {
      return; // Don't write snapshot while recovering
    }

    try {
      await ParcelWatcher.writeSnapshot(this.workspace.path, this.snapshotPath, this.getParcelWatcherOptions());
      this.logger.debug('Watcher snapshot written successfully');
    } catch (err: any) {
      this.logger.debug(`Failed to write watcher snapshot: ${err.message}`);
    }
  }

  /**
   * Recover from FSEvents buffer overflow by reading all events since the last snapshot.
   * This is called after debouncing multiple drop errors.
   */
  private async recoverFromSnapshot(): Promise<void> {
    if (this.isRecoveringFromSnapshot) {
      this.logger.debug('Already recovering from snapshot, skipping');
      return;
    }

    this.isRecoveringFromSnapshot = true;

    // Clear the debounce timer since we're now executing the recovery
    if (this.dropErrorDebounceTimer) {
      clearTimeout(this.dropErrorDebounceTimer);
      this.dropErrorDebounceTimer = null;
    }

    const startTime = new Date().getTime();
    const dropsDetected = this.dropErrorCount;

    // Reset drop error counter immediately to prevent multiple recoveries
    this.dropErrorCount = 0;

    try {
      if (this.verbose) {
        this.logger.console(
          chalk.yellow(
            `Recovering from FSEvents buffer overflow (${dropsDetected} drops detected). Scanning for missed events...`
          )
        );
      }

      // Check if snapshot exists
      if (!(await fs.pathExists(this.snapshotPath))) {
        if (this.verbose) {
          this.logger.console(chalk.yellow('No snapshot found. Skipping recovery.'));
        }
        return;
      }

      // Get all events since last snapshot
      const missedEvents = await ParcelWatcher.getEventsSince(
        this.workspace.path,
        this.snapshotPath,
        this.getParcelWatcherOptions()
      );

      // Write new snapshot immediately after reading events to prevent re-processing same events
      await this.writeSnapshotIfNeeded();

      const filteredEvents = missedEvents.filter((event) => !this.shouldIgnoreFromLocalScopeParcel(event.path));

      if (this.verbose) {
        this.logger.console(
          chalk.green(
            `Found ${filteredEvents.length} missed events (${missedEvents.length} total, ${missedEvents.length - filteredEvents.length} ignored)`
          )
        );
      }

      if (filteredEvents.length === 0) {
        if (this.verbose) {
          this.logger.console(chalk.green('No relevant missed events. Watcher state is consistent.'));
        }
        return;
      }

      // Log critical files that were missed (for debugging)
      if (this.verbose) {
        const criticalFiles = filteredEvents.filter(
          (e) => e.path.endsWith(BIT_MAP) || e.path.endsWith(WORKSPACE_JSONC)
        );
        if (criticalFiles.length > 0) {
          this.logger.console(
            chalk.cyan(`Critical files in missed events: ${criticalFiles.map((e) => basename(e.path)).join(', ')}`)
          );
        }
      }

      // Process all missed events using shared helper
      await this.processEvents(filteredEvents, startTime);

      if (this.verbose) {
        const duration = new Date().getTime() - startTime;
        this.logger.console(chalk.green(`✓ Recovery complete in ${duration}ms. Watcher state restored.`));
      }
    } catch (err: any) {
      // If recovery failed with the same drop error, the operation is still ongoing - retry after delay
      if (err.message?.includes('Events were dropped by the FSEvents client')) {
        if (this.verbose) {
          this.logger.console(
            chalk.yellow(`Recovery scan also encountered buffer overflow. Retrying in ${DROP_ERROR_DEBOUNCE_MS}ms...`)
          );
        }

        // Increment counter since we're encountering another drop
        this.dropErrorCount++;

        // Schedule another retry
        setTimeout(async () => {
          await this.recoverFromSnapshot();
        }, DROP_ERROR_DEBOUNCE_MS);
      } else {
        // Other errors - log and give up (counter already reset at start)
        this.logger.error(`Snapshot recovery failed: ${err.message}`);
        if (this.verbose) {
          this.logger.console(chalk.red(`Failed to recover from snapshot. Some events may have been missed.`));
        }
      }
    } finally {
      this.isRecoveringFromSnapshot = false;
    }
  }
}
