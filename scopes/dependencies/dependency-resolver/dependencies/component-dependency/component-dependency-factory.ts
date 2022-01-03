import mapSeries from 'p-map-series';
import { ComponentMain } from '@teambit/component';
import { compact } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import { valid } from 'semver';
import { Dependency as LegacyDependency } from '@teambit/legacy/dist/consumer/component/dependencies';
import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import { BitError } from '@teambit/bit-error';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { ComponentDependency, SerializedComponentDependency, TYPE } from './component-dependency';
import { DependencyLifecycleType } from '../dependency';
import { DependencyFactory } from '../dependency-factory';
import { DependencyList } from '../dependency-list';
import { VariantPolicy } from '../..';
import { VariantPolicyEntry } from '../../policy/variant-policy/variant-policy';

// TODO: think about where is the right place to put this
// export class ComponentDependencyFactory implements DependencyFactory<ComponentDependency, SerializedComponentDependency> {
//   parse(serialized: SerializedComponentDependency) {
//     const id = ComponentID.fromObject(serialized.componentId);
//     return new ComponentDependency(id, serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType);
//   }
// }

export class ComponentDependencyFactory implements DependencyFactory {
  type: string;

  constructor(private componentAspect: ComponentMain) {
    this.type = TYPE;
  }

  // TODO: solve this generics issue and remove the ts-ignore
  // @ts-ignore
  async parse<ComponentDependency, S extends SerializedComponentDependency>(
    serialized: S
  ): Promise<ComponentDependency> {
    let id;

    if (serialized.componentId.scope) {
      // @ts-ignore - ts is saying scope is possibly missing, but just checked it is defined
      id = ComponentID.fromObject(serialized.componentId);
    } else {
      id = await this.componentAspect.getHost().resolveComponentId(serialized.id);
    }

    return new ComponentDependency(
      id,
      serialized.isExtension,
      serialized.packageName,
      serialized.id,
      serialized.version,
      serialized.lifecycle as DependencyLifecycleType,
      serialized.source
    ) as unknown as ComponentDependency;
  }
  async fromLegacyComponentAndPolicy(legacyComponent: LegacyComponent, policy: VariantPolicy): Promise<DependencyList> {
    const runtimeDeps = await mapSeries(legacyComponent.dependencies.get(), (dep) =>
      this.transformLegacyComponentDepToSerializedDependency(dep, 'runtime')
    );
    const devDeps = await mapSeries(legacyComponent.devDependencies.get(), (dep) =>
      this.transformLegacyComponentDepToSerializedDependency(dep, 'dev')
    );
    const extensionDeps = await this.getExtensionsDepsFromPolicy(policy);
    const filteredExtensionDeps: SerializedComponentDependency[] = compact(extensionDeps);
    const serializedComponentDeps = [...runtimeDeps, ...devDeps, ...filteredExtensionDeps];
    const componentDeps: ComponentDependency[] = await mapSeries(serializedComponentDeps, (dep) => this.parse(dep));
    const dependencyList = new DependencyList(componentDeps);
    return dependencyList;
  }

  private async transformLegacyComponentDepToSerializedDependency(
    legacyDep: LegacyDependency,
    lifecycle: DependencyLifecycleType
  ): Promise<SerializedComponentDependency> {
    let packageName = legacyDep.packageName || '';
    if (!packageName) {
      const host = this.componentAspect.getHost();
      const id = await host.resolveComponentId(legacyDep.id);
      const depComponent = await host.get(id);
      if (depComponent) {
        packageName = componentIdToPackageName(depComponent.state._consumer);
      }
    }

    return {
      id: legacyDep.id.toString(),
      isExtension: false,
      packageName,
      componentId: legacyDep.id.serialize(),
      version: legacyDep.id.getVersion().toString(),
      __type: TYPE,
      lifecycle,
    };
  }

  private async getExtensionsDepsFromPolicy(policy: VariantPolicy): Promise<Array<SerializedComponentDependency>> {
    const results = await Promise.all(
      policy.entries.map((entry) => {
        if (entry.source === 'extensionEntry') {
          return this.transformPolicyEntryExtensionToSerializedDependency(entry, 'dev');
        }
        return undefined;
      })
    );
    return compact(results);
  }

  private async transformPolicyEntryExtensionToSerializedDependency(
    entry: VariantPolicyEntry,
    lifecycle: DependencyLifecycleType
  ): Promise<SerializedComponentDependency | undefined> {
    const host = this.componentAspect.getHost();
    const id = await host.resolveComponentId(entry.dependencyId);
    const idNoRange = valid(id.version) ? id : id.changeVersion('latest');
    const exist = await host.hasIdNested(idNoRange);
    // This happen during load, so we need to make sure we have it now, otherwise the load will fail
    if (!exist) {
      await host.fetch([idNoRange], {});
    }
    const extComponent = await host.get(idNoRange);
    let version: string | null | undefined = '0.0.1';
    if (!extComponent?.tags.isEmpty()) {
      const range = entry.value.version;
      version = extComponent?.tags.maxSatisfying(range);
      if (!version) {
        throw new BitError(
          `could not find matching version for extension with id: ${id.toString()} and version ${range}`
        );
      }
    }
    let packageName = '';
    if (extComponent) {
      packageName = componentIdToPackageName(extComponent.state._consumer);
    }
    return {
      id: id.toString(),
      isExtension: true,
      packageName,
      componentId: id,
      version,
      __type: TYPE,
      lifecycle,
    };
  }
}
