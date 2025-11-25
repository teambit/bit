import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import { Analytics } from '@teambit/legacy.analytics';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { InvalidScopeName, InvalidScopeNameFromRemote } from '@teambit/legacy-bit-id';
import pMapSeries from 'p-map-series';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import type { ComponentWriterMain } from '@teambit/component-writer';
import { ComponentWriterAspect } from '@teambit/component-writer';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import { DEFAULT_LANE, LaneId } from '@teambit/lane-id';
import { ScopeComponentsImporter } from '@teambit/legacy.scope';
import { importAllArtifactsFromLane } from '@teambit/component.sources';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import type { Lane } from '@teambit/objects';
import { ScopeNotFoundOrDenied } from '@teambit/scope.remotes';
import type { GraphMain } from '@teambit/graph';
import { GraphAspect } from '@teambit/graph';
import { LaneNotFound } from '@teambit/legacy.scope-api';
import { BitError } from '@teambit/bit-error';
import { ImportCmd } from './import.cmd';
import { ImporterAspect } from './importer.aspect';
import { FetchCmd } from './fetch-cmd';
import type { ImportOptions, ImportResult } from './import-components';
import ImportComponents from './import-components';
import type { ListerMain } from '@teambit/lister';
import { ListerAspect } from '@teambit/lister';

export class ImporterMain {
  constructor(
    private workspace: Workspace,
    private depResolver: DependencyResolverMain,
    private graph: GraphMain,
    private scope: ScopeMain,
    private componentWriter: ComponentWriterMain,
    private envs: EnvsMain,
    readonly logger: Logger,
    private lister: ListerMain
  ) {}

  async import(importOptions: ImportOptions, packageManagerArgs: string[] = []): Promise<ImportResult> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    consumer.packageManagerArgs = packageManagerArgs;
    if (!importOptions.ids.length) {
      importOptions.objectsOnly = true;
    }
    if (this.workspace.consumer.isOnLane()) {
      const currentRemoteLane = await this.workspace.getCurrentRemoteLane();
      if (currentRemoteLane) {
        importOptions.lanes = { laneId: currentRemoteLane.toLaneId(), remoteLane: currentRemoteLane };
      } else if (!importOptions.ids.length) {
        // this is probably a local lane that was never exported.
        // although no need to fetch from the lane, still, the import is needed for main (which are available on this
        // local lane)
        const currentLaneId = this.workspace.getCurrentLaneId();
        importOptions.lanes = { laneId: currentLaneId };
      }
    }
    const importComponents = this.createImportComponents(importOptions);
    const results = await importComponents.importComponents();
    Analytics.setExtraData('num_components', results.importedIds.length);
    if (results.writtenComponents && results.writtenComponents.length) {
      await this.removeFromWorkspaceConfig(results.writtenComponents);
    }
    await consumer.onDestroy('import');
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
      writeConfigFiles: false,
    };
    const importComponents = this.createImportComponents(importOptions);
    return importComponents.importComponents();
  }

  /**
   * given a lane object, load all components by their head on the lane, find the artifacts refs and import them from
   * the lane scope
   */
  async importHeadArtifactsFromLane(lane: Lane, ids: ComponentID[] = lane.toComponentIds(), throwIfMissing = false) {
    const laneComps = await this.scope.legacyScope.getManyConsumerComponents(ids);
    try {
      await importAllArtifactsFromLane(this.scope.legacyScope, laneComps, lane);
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
      writeConfigFiles: false,
    };
    const currentRemoteLane = await this.workspace.getCurrentRemoteLane();
    if (currentRemoteLane) {
      importOptions.lanes = { laneId: currentRemoteLane.toLaneId(), remoteLane: currentRemoteLane };
    }
    const importComponents = this.createImportComponents(importOptions);
    return importComponents.importComponents();
  }

  async importObjectsFromMainIfExist(ids: ComponentID[], { cache } = { cache: false }) {
    await this.scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray(ids), {
      cache,
      includeVersionHistory: true,
      ignoreMissingHead: true,
    });
  }

  /**
   * fetch lane's components and save them in the local scope.
   * once done, merge the lane object and save it as well.
   */
  async fetchLaneComponents(lane: Lane, includeUpdateDependents = false) {
    const ids = includeUpdateDependents ? lane.toComponentIdsIncludeUpdateDependents() : lane.toComponentIds();
    await this.scope.legacyScope.scopeImporter.importMany({
      ids,
      lane,
      reason: `for fetching lane ${lane.id()}`,
      includeUpdateDependents,
    });
    const { mergeLane } = await this.scope.legacyScope.sources.mergeLane(lane, true);
    const isRemoteLaneEqualsToMergedLane = lane.isEqual(mergeLane);
    await this.scope.legacyScope.lanes.saveLane(mergeLane, {
      saveLaneHistory: !isRemoteLaneEqualsToMergedLane,
      laneHistoryMsg: 'fetch (merge from remote)',
    });
  }

  async fetch(ids: string[], lanes: boolean, components: boolean, fromOriginalScope: boolean, allHistory = false) {
    if (!lanes && !components) {
      throw new BitError(
        `please provide the type of objects you would like to pull, the options are --components and --lanes`
      );
    }
    this.logger.setStatusLine('fetching objects...');
    if (!this.workspace) {
      const importedIds = await this.fetchUsingScope(ids, lanes, components, fromOriginalScope, allHistory);
      return { importedIds };
    }
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
      writeConfigFiles: false,
      fromOriginalScope,
    };

    const importComponents = this.createImportComponents(importOptions);
    const { importedIds, importDetails } = await importComponents.importComponents();
    Analytics.setExtraData('num_components', importedIds.length);
    await consumer.onDestroy('import');
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
      } catch (err: any) {
        if (
          err instanceof InvalidScopeName ||
          err instanceof ScopeNotFoundOrDenied ||
          err instanceof LaneNotFound ||
          err instanceof InvalidScopeNameFromRemote
        ) {
          // the lane could be a local lane so no need to throw an error in such case
          logger.clearStatusLine();
          logger.console(`unable to get lane's data from a remote due to an error:\n${err.message}`, 'warn', 'yellow');
        } else {
          throw err;
        }
      }

      return [];
    }
  }

  /**
   * fetch objects similar to the fetch method but without workspace dependency.
   * can be used outside of workspace context.
   */
  async fetchUsingScope(
    ids: string[],
    lanes: boolean,
    components: boolean,
    fromOriginalScope: boolean,
    allHistory = false
  ): Promise<ComponentID[]> {
    this.logger.setStatusLine('fetching objects...');
    if (!ids.length) {
      throw new BitError('please specify the IDs of the objects you want to fetch');
    }
    if (lanes) {
      const remoteLaneIds = ids.map((id) => LaneId.parse(id));
      const scopeComponentImporter = this.scope.legacyScope.scopeImporter;
      const lanesToFetch = await scopeComponentImporter.importLanes(remoteLaneIds);
      return this.fetchLanesUsingScope(lanesToFetch);
    }
    if (components) {
      return this.fetchComponentsUsingScope(ids, fromOriginalScope, allHistory);
    }
    throw new BitError(
      `please provide the type of objects you would like to pull, the options are --components and --lanes`
    );
  }

  private async fetchLanesUsingScope(lanes: Lane[]): Promise<ComponentID[]> {
    const resultsPerLane = await pMapSeries(lanes, async (lane) => {
      this.logger.setStatusLine(`fetching lane ${lane.name}`);
      const importResults = await this.scope.legacyScope.scopeImporter.importMany({
        ids: lane.toComponentIds(),
        lane,
        reason: `for fetching lane ${lane.id()}`,
      });
      const { mergeLane } = await this.scope.legacyScope.sources.mergeLane(lane, true);
      const isRemoteLaneEqualsToMergedLane = lane.isEqual(mergeLane);
      await this.scope.legacyScope.lanes.saveLane(mergeLane, {
        saveLaneHistory: !isRemoteLaneEqualsToMergedLane,
        laneHistoryMsg: 'fetch (merge from remote)',
      });
      const results = importResults.map((result) => result.component.id);
      this.logger.consoleSuccess();
      return results;
    });

    return resultsPerLane.flat();
  }

  private async fetchComponentsUsingScope(
    ids: string[],
    fromOriginalScope: boolean,
    allHistory: boolean
  ): Promise<ComponentID[]> {
    const componentIds = await this.scope.resolveMultipleComponentIds(ids);
    const componentIdsList = ComponentIdList.fromArray(componentIds);
    const scopeImporter = this.scope.legacyScope.scopeImporter;

    await scopeImporter.importWithoutDeps(componentIdsList.toVersionLatest(), {
      cache: false,
      includeVersionHistory: true,
      fetchHeadIfLocalIsBehind: !allHistory,
      collectParents: allHistory,
      ignoreMissingHead: true,
      reason: `for fetching components`,
    });

    const results = fromOriginalScope
      ? await scopeImporter.importManyFromOriginalScopes(componentIdsList)
      : await scopeImporter.importMany({
          ids: componentIdsList,
          ignoreMissingHead: true,
          preferDependencyGraph: true,
          reFetchUnBuiltVersion: true,
          throwForSeederNotFound: false,
          reason: 'for fetching components dependencies',
        });

    return results.map((c) => c.component.id);
  }

  private createImportComponents(importOptions: ImportOptions) {
    return new ImportComponents(
      this.workspace,
      this.graph,
      this.componentWriter,
      this.envs,
      this.logger,
      this.lister,
      importOptions
    );
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
      options.lanes = { laneId: lane.toLaneId(), remoteLane: lane };
      options.isLaneFromRemote = true;
      const results = await this.importObjects(options);
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
  async importLaneObject(laneId: LaneId, persistIfNotExists = true, includeLaneHistory = false): Promise<Lane> {
    const legacyScope = this.scope.legacyScope;
    const results = await legacyScope.scopeImporter.importLanes([laneId], includeLaneHistory);
    const laneObject = results[0];
    if (!laneObject) throw new LaneNotFound(laneId.scope, laneId.name);

    if (persistIfNotExists) {
      const exists = await legacyScope.loadLane(laneId);
      if (!exists) {
        laneObject.hasChanged = true;
        await legacyScope.lanes.saveLane(laneObject, { saveLaneHistory: false });
      }
    }

    return laneObject;
  }

  async importObjectsByHashes(hashes: string[], scope: string, reason?: string) {
    const groupByScope = { [scope]: hashes };
    const results = await this.scope.legacyScope.scopeImporter.importManyObjects(groupByScope, reason);
    return results;
  }

  private async removeFromWorkspaceConfig(component: ConsumerComponent[]) {
    const importedPackageNames = this.getImportedPackagesNames(component);
    const isRemoved = this.depResolver.removeFromRootPolicy(importedPackageNames);
    if (isRemoved) await this.depResolver.persistConfig('import (remove package)');
  }

  private getImportedPackagesNames(components: ConsumerComponent[]): string[] {
    return components.map((component) => componentIdToPackageName(component));
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    DependencyResolverAspect,
    GraphAspect,
    ScopeAspect,
    ComponentWriterAspect,
    InstallAspect,
    EnvsAspect,
    LoggerAspect,
    ListerAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    depResolver,
    graph,
    scope,
    componentWriter,
    install,
    envs,
    loggerMain,
    lister,
  ]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    GraphMain,
    ScopeMain,
    ComponentWriterMain,
    InstallMain,
    EnvsMain,
    LoggerMain,
    ListerMain,
  ]) {
    const logger = loggerMain.createLogger(ImporterAspect.id);
    const importerMain = new ImporterMain(workspace, depResolver, graph, scope, componentWriter, envs, logger, lister);
    install.registerPreInstall(async (opts) => {
      if (!opts?.import) return;
      logger.setStatusLine('importing missing objects');
      await importerMain.importCurrentObjects();
      // logger.consoleSuccess();
    });
    install.registerPreLink(async (opts) => {
      if (opts?.fetchObject) await importerMain.importCurrentObjects();
    });
    cli.register(new ImportCmd(importerMain), new FetchCmd(importerMain));
    return importerMain;
  }
}

ImporterAspect.addRuntime(ImporterMain);
