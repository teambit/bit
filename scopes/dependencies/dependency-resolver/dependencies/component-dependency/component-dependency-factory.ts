import { ComponentMain } from '@teambit/component';
import { compact } from 'ramda-adjunct';
import { ComponentDependency, SerializedComponentDependency, TYPE } from './component-dependency';
import { Dependency as LegacyDependency } from 'bit-bin/dist/consumer/component/dependencies';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { ExtensionDataEntry } from 'bit-bin/dist/consumer/config';
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
    const id = await this.componentAspect.getHost().resolveComponentId(serialized.id);
    return (new ComponentDependency(
      id,
      serialized.isExtension,
      serialized.id,
      serialized.version,
      serialized.lifecycle as DependencyLifecycleType
    ) as unknown) as ComponentDependency;
  }

  async fromLegacyComponent(legacyComponent: LegacyComponent): Promise<DependencyList> {
    const runtimeDeps = legacyComponent.dependencies
      .get()
      .map((dep) => transformLegacyComponentDepToSerializedDependency(dep, 'runtime'));
    const devDeps = legacyComponent.devDependencies
      .get()
      .map((dep) => transformLegacyComponentDepToSerializedDependency(dep, 'dev'));
    let extensionDeps = legacyComponent.extensions.map((extension) =>
      transformLegacyComponentExtensionToSerializedDependency(extension, 'dev')
    );
    const filteredExtensionDeps: SerializedComponentDependency[] = compact(extensionDeps);
    const serializedComponentDeps = [...runtimeDeps, ...devDeps, ...filteredExtensionDeps];
    const componentDepsP: Promise<ComponentDependency>[] = serializedComponentDeps.map((dep) => this.parse(dep));
    const componentDeps: ComponentDependency[] = await Promise.all(componentDepsP);
    const dependencyList = new DependencyList(componentDeps);
    return dependencyList;
  }
}

function transformLegacyComponentDepToSerializedDependency(
  legacyDep: LegacyDependency,
  lifecycle: DependencyLifecycleType
): SerializedComponentDependency {
  return {
    id: legacyDep.id.toString(),
    isExtension: false,
    componentId: legacyDep.id.serialize(),
    version: legacyDep.id.getVersion().toString(),
    __type: TYPE,
    lifecycle,
  };
}

function transformLegacyComponentExtensionToSerializedDependency(
  extension: ExtensionDataEntry,
  lifecycle: DependencyLifecycleType
): SerializedComponentDependency | undefined {
  if (!extension.extensionId) {
    return undefined;
  }
  return {
    id: extension.extensionId.toString(),
    isExtension: true,
    componentId: extension.extensionId.serialize(),
    version: extension.extensionId.getVersion().toString(),
    __type: TYPE,
    lifecycle,
  };
}
