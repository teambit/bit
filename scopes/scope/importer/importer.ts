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
    await this.populateLanesDataIfNeeded(importOptions);
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

  private async populateLanesDataIfNeeded(importOptions: ImportOptions) {
    importOptions.lanes = (await this.workspace.getCurrentRemoteLaneId()) || undefined;
  }
}
