import { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Workspace } from '@teambit/workspace';
import R from 'ramda';
import { Analytics } from '@teambit/legacy/dist/analytics/analytics';
import ImportComponents, {
  ImportOptions,
  ImportResult,
} from '@teambit/legacy/dist/consumer/component-ops/import-components';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';

export class Importer {
  constructor(private workspace: Workspace, private depResolver: DependencyResolverMain) {}

  async import(importOptions: ImportOptions, packageManagerArgs: string[]): Promise<ImportResult> {
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

  private async removeFromWorkspaceConfig(component: ConsumerComponent[]) {
    const importedPackageNames = this.getImportedPackagesNames(component);
    this.depResolver.removeFromRootPolicy(importedPackageNames);
    await this.depResolver.persistConfig(this.workspace.path);
  }

  private getImportedPackagesNames(components: ConsumerComponent[]): string[] {
    return components.map((component) => componentIdToPackageName(component));
  }
}
