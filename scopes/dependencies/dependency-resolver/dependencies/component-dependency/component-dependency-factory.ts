import mapSeries from 'p-map-series';
import { ComponentMain } from '@teambit/component';
import { compact } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import { Dependency as LegacyDependency } from '@teambit/legacy/dist/consumer/component/dependencies';
import LegacyComponent from '@teambit/legacy/dist/consumer/component';
import { ExtensionDataEntry } from '@teambit/legacy/dist/consumer/config';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { ComponentDependency, SerializedComponentDependency, TYPE } from './component-dependency';
import { DependencyLifecycleType } from '../dependency';
import { DependencyFactory } from '../dependency-factory';
import { DependencyList } from '../dependency-list';

export class ComponentDependencyFactory implements DependencyFactory {
  type: string;

  constructor(private componentAspect: ComponentMain) {
    this.type = TYPE;
  }

  // TODO: solve this generics issue and remove the ts-ignore
  // @ts-ignore
  parse<ComponentDependency, S extends SerializedComponentDependency>(serialized: S): ComponentDependency {
    let id;

    if (serialized.componentId instanceof ComponentID) {
      id = serialized.componentId;
    } else if (typeof serialized.componentId === 'object' && serialized.componentId.scope) {
      id = ComponentID.fromObject(serialized.componentId as any);
    } else {
      throw new Error(`ComponentDependencyFactory, unable to parse ${serialized.componentId}`);
    }

    return new ComponentDependency(
      id,
      serialized.isExtension,
      serialized.packageName,
      serialized.id,
      serialized.version,
      serialized.lifecycle as DependencyLifecycleType,
      serialized.source,
      serialized.hidden,
      serialized.optional,
      serialized.versionRange
    ) as unknown as ComponentDependency;
  }

  async fromLegacyComponent(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const runtimeDeps = await mapSeries(legacyComponent.dependencies.get(), (dep) =>
      this.transformLegacyComponentDepToSerializedDependency(dep, 'runtime')
    );
    const devDeps = await mapSeries(legacyComponent.devDependencies.get(), (dep) =>
      this.transformLegacyComponentDepToSerializedDependency(dep, 'dev')
    );
    const peerDeps = await mapSeries(legacyComponent.peerDependencies.get(), (dep) =>
      this.transformLegacyComponentDepToSerializedDependency(dep, 'peer')
    );
    const extensionDeps = await mapSeries(legacyComponent.extensions, (extension) =>
      this.transformLegacyComponentExtensionToSerializedDependency(extension, 'dev')
    );
    const filteredExtensionDeps: SerializedComponentDependency[] = compact(extensionDeps);
    const serializedComponentDeps = [...runtimeDeps, ...devDeps, ...peerDeps, ...filteredExtensionDeps];
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
      const id = legacyDep.id;
      const depComponent = await host.getLegacyMinimal(id);
      if (depComponent) {
        packageName = componentIdToPackageName(depComponent);
      }
    }

    return {
      id: legacyDep.id.toString(),
      isExtension: false,
      packageName,
      componentId: legacyDep.id.serialize(),
      version: legacyDep.id._legacy.getVersion().toString(),
      versionRange: legacyDep.versionRange,
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
    const id = extension.extensionId;
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
      version: extension.extensionId._legacy.getVersion().toString(),
      __type: TYPE,
      lifecycle,
    };
  }
}
