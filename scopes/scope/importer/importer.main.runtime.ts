import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';
import R from 'ramda';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import ImportComponents, {
  ImportOptions,
  ImportResult,
} from '@teambit/legacy/dist/consumer/component-ops/import-components';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';

import { InvalidScopeName, InvalidScopeNameFromRemote } from '@teambit/legacy-bit-id';
import logger from '@teambit/legacy/dist/logger/logger';
import { LaneId } from '@teambit/lane-id';
import ScopeComponentsImporter from '@teambit/legacy/dist/scope/component-ops/scope-components-importer';
import loader from '@teambit/legacy/dist/cli/loader';
import { Lane } from '@teambit/legacy/dist/scope/models';
import { ScopeNotFoundOrDenied } from '@teambit/legacy/dist/remotes/exceptions/scope-not-found-or-denied';
import { LaneNotFound } from '@teambit/legacy/dist/api/scope/lib/exceptions/lane-not-found';
import { BitError } from '@teambit/bit-error';
import { ImportCmd } from './import.cmd';
import { ImporterAspect } from './importer.aspect';
import { FetchCmd } from './fetch-cmd';

export class ImporterMain {
  constructor(private workspace: Workspace, private depResolver: DependencyResolverMain) {}

  async import(importOptions: ImportOptions, packageManagerArgs: string[]): Promise<ImportResult> {
    if (!this.workspace) throw new ConsumerNotFound();
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
    const importComponents = new ImportComponents(consumer, importOptions);
    const { dependencies, importDetails } = await importComponents.importComponents();
    const bitIds = dependencies.map(R.path(['component', 'id']));
    Analytics.setExtraData('num_components', bitIds.length);
    if (importOptions.ids.length) {
      const importedComponents = dependencies.map((d) => d.component);
      await this.removeFromWorkspaceConfig(importedComponents);
    }
    await consumer.onDestroy();
    return { dependencies, importDetails };
  }

  async fetch(ids: string[], lanes: boolean, components: boolean, fromOriginalScope: boolean) {
    if (!lanes && !components) {
      throw new BitError(
        `please provide the type of objects you would like to pull, the options are --components and --lanes`
      );
    }
    loader.start('fetching objects...');
    if (!this.workspace) throw new ConsumerNotFound();
    const consumer = this.workspace.consumer;
    const importOptions: ImportOptions = {
      ids,
      objectsOnly: true,
      verbose: false,
      withEnvironments: false,
      writePackageJson: false,
      writeConfig: false,
      writeDists: false,
      override: false,
      installNpmPackages: false,
      fromOriginalScope,
    };
    if (lanes) {
      importOptions.lanes = await getLanes();
      importOptions.ids = [];
    }
    const importComponents = new ImportComponents(consumer, importOptions);
    const { dependencies, envComponents, importDetails } = await importComponents.importComponents();
    const bitIds = dependencies.map(R.path(['component', 'id']));
    Analytics.setExtraData('num_components', bitIds.length);
    await consumer.onDestroy();
    return { dependencies, envComponents, importDetails };

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
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect, CommunityAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, depResolver, community]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    CommunityMain
  ]) {
    const importerMain = new ImporterMain(workspace, depResolver);
    cli.register(new ImportCmd(importerMain, community.getDocsDomain()), new FetchCmd(importerMain));
    return importerMain;
  }
}

ImporterAspect.addRuntime(ImporterMain);
