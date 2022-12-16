import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { InvalidScopeName, InvalidScopeNameFromRemote } from '@teambit/legacy-bit-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { LaneId } from '@teambit/lane-id';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import loader from '@teambit/legacy/dist/cli/loader';
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
  constructor(private workspace: Workspace, private depResolver: DependencyResolverMain, private graph: GraphMain) {}

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
    const importComponents = new ImportComponents(this.workspace, this.graph, importOptions);
    const results = await importComponents.importComponents();
    Analytics.setExtraData('num_components', results.importedIds.length);
    if (results.writtenComponents && results.writtenComponents.length) {
      await this.removeFromWorkspaceConfig(results.writtenComponents);
    }
    await consumer.onDestroy();
    return results;
  }

  /**
   * @todo: combine with this.import()
   */
  async importWithOptions(importOptions: ImportOptions) {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const importComponents = new ImportComponents(this.workspace, this.graph, importOptions);
    return importComponents.importComponents();
  }

  async fetch(ids: string[], lanes: boolean, components: boolean, fromOriginalScope: boolean) {
    if (!lanes && !components) {
      throw new BitError(
        `please provide the type of objects you would like to pull, the options are --components and --lanes`
      );
    }
    loader.start('fetching objects...');
    if (!this.workspace) throw new OutsideWorkspaceError();
    const consumer = this.workspace.consumer;
    const importOptions: ImportOptions = {
      ids,
      objectsOnly: true,
      verbose: false,
      writeConfig: false,
      override: false,
      installNpmPackages: false,
      fromOriginalScope,
    };
    if (lanes) {
      importOptions.lanes = await getLanes();
      importOptions.ids = [];
    }
    const importComponents = new ImportComponents(this.workspace, this.graph, importOptions);
    const { importedIds, importDetails } = await importComponents.importComponents();
    Analytics.setExtraData('num_components', importedIds.length);
    await consumer.onDestroy();
    return { importedIds, importDetails };

    async function getLanes(): Promise<{ laneIds: LaneId[]; lanes: Lane[] }> {
      const result: { laneIds: LaneId[]; lanes: Lane[] } = { laneIds: [], lanes: [] };
      let remoteLaneIds: LaneId[] = [];
      if (ids.length) {
        remoteLaneIds = ids.map((id) => {
          const trackLane = consumer.scope.lanes.getRemoteTrackedDataByLocalLane(id);
          if (trackLane) return LaneId.from(trackLane.remoteLane, trackLane.remoteScope);
          return LaneId.parse(id);
        });
      } else {
        remoteLaneIds = await consumer.scope.objects.remoteLanes.getAllRemoteLaneIds();
      }
      const scopeComponentImporter = ScopeComponentsImporter.getInstance(consumer.scope);
      try {
        const remoteLanes = await scopeComponentImporter.importLanes(remoteLaneIds);
        result.laneIds.push(...remoteLaneIds);
        result.lanes.push(...remoteLanes);
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

      return result;
    }
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
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect, CommunityAspect, GraphAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, depResolver, community, graph]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    CommunityMain,
    GraphMain
  ]) {
    const importerMain = new ImporterMain(workspace, depResolver, graph);
    cli.register(new ImportCmd(importerMain, community.getDocsDomain()), new FetchCmd(importerMain));
    return importerMain;
  }
}

ImporterAspect.addRuntime(ImporterMain);
