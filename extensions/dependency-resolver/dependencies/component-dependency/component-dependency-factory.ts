import { ComponentID } from '@teambit/component';
import { DependencyLifecycleType } from '../dependency';
import { ComponentDependency, SerializedComponentDependency } from './component-dependency';
import { DependencyFactory } from '../dependency-factory';

// TODO: think about where is the right place to put this
// export class ComponentDependencyFactory implements DependencyFactory<ComponentDependency, SerializedComponentDependency> {
//   parse(serialized: SerializedComponentDependency) {
//     const id = ComponentID.fromObject(serialized.componentId);
//     return new ComponentDependency(id, serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType);
//   }
// }

export class ComponentDependencyFactory implements DependencyFactory {
  type: 'component';

  parse<ComponentDependency, S extends SerializedComponentDependency>(serialized: S): ComponentDependency {
    const id = ComponentID.fromObject(serialized.componentId);
    return (new ComponentDependency(
      id,
      serialized.id,
      serialized.version,
      serialized.type,
      serialized.lifecycle as DependencyLifecycleType
    ) as unknown) as ComponentDependency;
  }
}
