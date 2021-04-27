import mapSeries from 'p-map-series';
import { ComponentMain, ComponentID } from '@teambit/component';
import { compact } from 'lodash';
import { Dependency as LegacyDependency } from '@teambit/legacy/dist/consumer/component/dependencies';
import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { ComponentDependency, SerializedComponentDependency, TYPE } from './component-dependency';
import { DependencyLifecycleType } from '../dependency';
import { DependencyFactory } from '../dependency-factory';
import { DependencyList } from '../dependency-list';

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
      id = ComponentID.fromObject(serialized.componentId);
    } else {
      id = await this.componentAspect.getHost().resolveComponentId(serialized.id);
    }

    return (new ComponentDependency(
      id,
      serialized.isExtension,
      serialized.packageName,
      serialized.id,
      serialized.version,
      serialized.lifecycle as DependencyLifecycleType
    ) as unknown) as ComponentDependency;
  }

  async fromLegacyComponent(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const runtimeDeps = await mapSeries(legacyComponent.dependencies.get(), (dep) =>
      this.transformLegacyComponentDepToSerializedDependency(dep, 'runtime')
    );
    const devDeps = await mapSeries(legacyComponent.devDependencies.get(), (dep) =>
      this.transformLegacyComponentDepToSerializedDependency(dep, 'dev')
    );
    const extensionDeps = await mapSeries(legacyComponent.extensions, (extension) =>
      this.transformLegacyComponentExtensionToSerializedDependency(extension, 'dev')
    );
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

  private async transformLegacyComponentExtensionToSerializedDependency(
    extension: ExtensionDataEntry,
    lifecycle: DependencyLifecycleType
  ): Promise<SerializedComponentDependency | undefined> {
    if (!extension.extensionId) {
      return undefined;
    }
    const host = this.componentAspect.getHost();
    const id = await host.resolveComponentId(extension.extensionId);
    const extComponent = await host.get(id);
    let packageName = '';
    if (extComponent) {
      packageName = componentIdToPackageName(extComponent.state._consumer);
    }
    return {
      id: extension.extensionId.toString(),
      isExtension: true,
      packageName,
      componentId: extension.extensionId.serialize(),
      version: extension.extensionId.getVersion().toString(),
      __type: TYPE,
      lifecycle,
    };
  }
}
