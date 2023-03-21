import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { BitId, InvalidScopeName, InvalidScopeNameFromRemote } from '@teambit/legacy-bit-id';
import pMapSeries from 'p-map-series';
import ComponentWriterAspect, { ComponentWriterMain } from '@teambit/component-writer';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import { importAllArtifacts } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import InstallAspect, { InstallMain } from '@teambit/install';
import loader from '@teambit/legacy/dist/cli/loader';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { ScopeNotFoundOrDenied } from '@teambit/legacy/dist/remotes/exceptions/scope-not-found-or-denied';
import GraphAspect, { GraphMain } from '@teambit/graph';
import { LaneNotFound } from '@teambit/legacy/dist/api/scope/lib/exceptions/lane-not-found';
import { BitError } from '@teambit/bit-error';
import { ImportCmd } from './import.cmd';
import { ImporterAspect } from './importer.aspect';
import { FetchCmd } from './fetch-cmd';
import ImportComponents, { ImportOptions, ImportResult } from './import-components';

export class ImporterMain {
  constructor(
    private workspace: Workspace,
    private depResolver: DependencyResolverMain,
    private graph: GraphMain,
    private scope: ScopeMain,
    private componentWriter: ComponentWriterMain,
    private logger: Logger
  ) {}

  async import(importOptions: ImportOptions, packageManagerArgs: string[]): Promise<ImportResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    consumer.packageManagerArgs = packageManagerArgs;
    if (!importOptions.ids.length) {
      importOptions.objectsOnly = true;
    }
    if (this.workspace.consumer.isOnLane()) {
      const currentRemoteLane = await this.workspace.getCurrentRemoteLane();
      if (currentRemoteLane) {
        importOptions.lanes = { laneIds: [currentRemoteLane.toLaneId()], lanes: [currentRemoteLane] };
      } else if (!importOptions.ids.length) {
        // this is probably a local lane that was never exported.
        // although no need to fetch from the lane, still, the import is needed for main (which are available on this
        // local lane)
        const currentLaneId = this.workspace.getCurrentLaneId();
        importOptions.lanes = { laneIds: [currentLaneId], lanes: [] };
      }
    }
    const importComponents = new ImportComponents(this.workspace, this.graph, this.componentWriter, importOptions);
    const results = await importComponents.importComponents();
    Analytics.setExtraData('num_components', results.importedIds.length);
    if (results.writtenComponents && results.writtenComponents.length) {
      await this.removeFromWorkspaceConfig(results.writtenComponents);
    }
    await consumer.onDestroy();
    return results;
  }

  /**
   * fetch objects according to the criteria set by `options` param.
   * to fetch current objects according to the current lane or main, use `this.importCurrentObjects()`.
   */
  async importObjects(options: Partial<ImportOptions> = {}): Promise<ImportResult> {
    const importOptions: ImportOptions = {
      ...options,
      objectsOnly: true,
      ids: options.ids || [],
      installNpmPackages: false,
    };
    const importComponents = new ImportComponents(this.workspace, this.graph, this.componentWriter, importOptions);
    return importComponents.importComponents();
  }

  /**
   * given a lane object, load all components by their head on the lane, find the artifacts refs and import them from
   * the lane scope
   */
  async importHeadArtifactsFromLane(lane: Lane, throwIfMissing = false) {
    const ids = lane.toBitIds();
    const laneComps = await this.scope.legacyScope.getManyConsumerComponents(ids);
    try {
      await importAllArtifacts(this.scope.legacyScope, laneComps, lane);
    } catch (err) {
      this.logger.error(`failed fetching artifacts for lane ${lane.id.toString()}`, err);
      if (throwIfMissing) throw err;
    }
  }

  /**
   * if on main, fetch main objects, if on lane, fetch lane objects.
   */
  async importCurrentObjects(): Promise<ImportResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const importOptions: ImportOptions = {
      ids: [],
      objectsOnly: true,
      installNpmPackages: false,
    };
    const currentRemoteLane = await this.workspace.getCurrentRemoteLane();
    if (currentRemoteLane) {
      importOptions.lanes = { laneIds: [currentRemoteLane.toLaneId()], lanes: [currentRemoteLane] };
    }
    const importComponents = new ImportComponents(this.workspace, this.graph, this.componentWriter, importOptions);
    return importComponents.importComponents();
  }

  async importObjectsFromMainIfExist(ids: BitId[]) {
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(BitIds.fromArray(ids), {
      cache: false,
      includeVersionHistory: true,
      ignoreMissingHead: true,
    });
  }

  async fetchLaneWithComponents(lane: Lane, options: Partial<ImportOptions> = {}): Promise<ImportResult> {
    options.lanes = { laneIds: [lane.toLaneId()], lanes: [lane] };
    return this.importObjects(options);
  }

  async fetch(ids: string[], lanes: boolean, components: boolean, fromOriginalScope: boolean, allHistory = false) {
    if (!lanes && !components) {
      throw new BitError(
        `please provide the type of objects you would like to pull, the options are --components and --lanes`
      );
    }
    loader.start('fetching objects...');
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;

    if (lanes) {
      const lanesToFetch = await getLanes(this.logger);
      const shouldFetchFromMain = !ids.length || ids.includes(DEFAULT_LANE);
      return this.fetchLanes(lanesToFetch, shouldFetchFromMain, { allHistory });
    }

    const importOptions: ImportOptions = {
      ids,
      objectsOnly: true,
      allHistory,
      verbose: false,
      writeConfig: false,
      override: false,
      installNpmPackages: false,
      fromOriginalScope,
    };

    const importComponents = new ImportComponents(this.workspace, this.graph, this.componentWriter, importOptions);
    const { importedIds, importDetails } = await importComponents.importComponents();
    Analytics.setExtraData('num_components', importedIds.length);
    await consumer.onDestroy();
    return { importedIds, importDetails };

    async function getLanes(logger: Logger): Promise<Lane[]> {
      let remoteLaneIds: LaneId[] = [];
      if (ids.length) {
        remoteLaneIds = ids
          .filter((id) => id !== DEFAULT_LANE)
          .map((id) => {
            const trackLane = consumer.scope.lanes.getRemoteTrackedDataByLocalLane(id);
            if (trackLane) return LaneId.from(trackLane.remoteLane, trackLane.remoteScope);
            return LaneId.parse(id);
          });
      } else {
        remoteLaneIds = await consumer.scope.objects.remoteLanes.getAllRemoteLaneIds();
      }
      const scopeComponentImporter = ScopeComponentsImporter.getInstance(consumer.scope);
      try {
        return await scopeComponentImporter.importLanes(remoteLaneIds);
      } catch (err) {
        if (
          err instanceof InvalidScopeName ||
          err instanceof ScopeNotFoundOrDenied ||
          err instanceof LaneNotFound ||
          err instanceof InvalidScopeNameFromRemote
        ) {
          // the lane could be a local lane so no need to throw an error in such case
          loader.stop();
          logger.console(`unable to get lane's data from a remote due to an error:\n${err.message}`, 'warn', 'yellow');
        } else {
          throw err;
        }
      }

      return [];
    }
  }

  async fetchLanes(
    lanes: Lane[],
    shouldFetchFromMain?: boolean,
    options: Partial<ImportOptions> = {}
  ): Promise<ImportResult> {
    const resultFromMain = shouldFetchFromMain
      ? await this.importObjects(options)
      : { importedIds: [], importDetails: [], importedDeps: [] };
    const resultsPerLane = await pMapSeries(lanes, async (lane) => {
      this.logger.setStatusLine(`fetching lane ${lane.name}`);
      const results = await this.fetchLaneWithComponents(lane, options);
      this.logger.consoleSuccess();
      return results;
    });
    resultsPerLane.push(resultFromMain);
    const results = resultsPerLane.reduce((acc, curr) => {
      acc.importedIds.push(...curr.importedIds);
      acc.importDetails.push(...curr.importDetails);
      return acc;
    });
    return results;
  }

  /**
   * get a Lane object from the remote.
   * `persistIfNotExists` saves the object in the local scope only if the lane is not there yet.
   * otherwise, it needs some merging mechanism, which is done differently whether it's export or import.
   * see `sources.mergeLane()` for export and `import-components._saveLaneDataIfNeeded()` for import.
   * in this case, because we only bring the lane object and not the components, it's not easy to do the merge.
   */
  async importLaneObject(laneId: LaneId, persistIfNotExists = true): Promise<Lane> {
    const legacyScope = this.scope.legacyScope;
    const results = await legacyScope.scopeImporter.importLanes([laneId]);
    const laneObject = results[0];
    if (!laneObject) throw new LaneNotFound(laneId.scope, laneId.name);

    if (persistIfNotExists) {
      const exists = await legacyScope.loadLane(laneId);
      if (!exists) {
        await legacyScope.lanes.saveLane(laneObject);
      }
    }

    return laneObject;
  }

  private async removeFromWorkspaceConfig(component: ConsumerComponent[]) {
    const importedPackageNames = this.getImportedPackagesNames(component);
    this.depResolver.removeFromRootPolicy(importedPackageNames);
    await this.depResolver.persistConfig(this.workspace.path);
  }

  private getImportedPackagesNames(components: ConsumerComponent[]): string[] {
    return components.map((component) => componentIdToPackageName(component));
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    DependencyResolverAspect,
    CommunityAspect,
    GraphAspect,
    ScopeAspect,
    ComponentWriterAspect,
    InstallAspect,
    LoggerAspect,
  ];
  static runtime = MainRuntime;
  static async provider([cli, workspace, depResolver, community, graph, scope, componentWriter, install, loggerMain]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    CommunityMain,
    GraphMain,
    ScopeMain,
    ComponentWriterMain,
    InstallMain,
    LoggerMain
  ]) {
    const logger = loggerMain.createLogger(ImporterAspect.id);
    const importerMain = new ImporterMain(workspace, depResolver, graph, scope, componentWriter, logger);
    install.registerPreInstall(async (opts) => {
      if (!opts?.import) return;
      logger.setStatusLine('importing missing objects');
      await importerMain.importCurrentObjects();
      logger.consoleSuccess();
    });
    install.registerPreLink(async (opts) => {
      if (opts?.fetchObject) await importerMain.importCurrentObjects();
    });
    cli.register(new ImportCmd(importerMain, community.getDocsDomain()), new FetchCmd(importerMain));
    return importerMain;
  }
}

ImporterAspect.addRuntime(ImporterMain);
