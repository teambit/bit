import { ComponentID } from '@teambit/component';
import { DependencyLifecycleType } from '../dependency';
import { ComponentDependency, SerializedComponentDependency } from './component-dependency';
import { DependencyFactory } from '../dependency-factory';
import { DependencyList } from '../dependency-list';
import { Dependency as LegacyDependency } from 'bit-bin/dist/consumer/component/dependencies';
import LegacyComponent from 'bit-bin/dist/consumer/component';

// TODO: think about where is the right place to put this
// export class ComponentDependencyFactory implements DependencyFactory<ComponentDependency, SerializedComponentDependency> {
//   parse(serialized: SerializedComponentDependency) {
//     const id = ComponentID.fromObject(serialized.componentId);
//     return new ComponentDependency(id, serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType);
//   }
// }

const TYPE = 'component';

export class ComponentDependencyFactory implements DependencyFactory {
  type: string;

  constructor() {
    this.type = TYPE;
  }

  // TODO: solve this generics issue and remove the ts-ignore
  // @ts-ignore
  parse<ComponentDependency, S extends SerializedComponentDependency>(serialized: S): ComponentDependency {
    const id = ComponentID.fromObject(serialized.componentId);
    return (new ComponentDependency(
      id,
      serialized.id,
      serialized.version,
      serialized.lifecycle as DependencyLifecycleType
    ) as unknown) as ComponentDependency;
  }

  fromLegacyComponent(legacyComponent: LegacyComponent): DependencyList {
    const runtimeDeps = legacyComponent.dependencies
      .get()
      .map((dep) => transformLegacyComponentDepToSerializedDependency(dep, 'runtime'));
    const devDeps = legacyComponent.devDependencies
      .get()
      .map((dep) => transformLegacyComponentDepToSerializedDependency(dep, 'dev'));
    const serializedComponentDeps = runtimeDeps.concat(devDeps);
    const componentDeps: ComponentDependency[] = serializedComponentDeps.map((dep) => this.parse(dep));
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
    componentId: legacyDep.id.serialize(),
    version: legacyDep.id.getVersion().toString(),
    __type: TYPE,
    lifecycle,
  };
}
