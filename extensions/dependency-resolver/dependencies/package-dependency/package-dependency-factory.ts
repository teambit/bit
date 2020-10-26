import { DependencyLifecycleType, SerializedDependency } from '../dependency';
import { PackageDependency } from './package-dependency';
import { DependencyFactory } from '../dependency-factory';

// TODO: think about where is the right place to put this
export class PackageDependencyFactory implements DependencyFactory {
  // parse<PackageDependency, SerializedDependency>(serialized: SerializedDependency): PackageDependency {
  //   return new PackageDependency(serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType);
  // }
  type: string;

  constructor() {
    this.type = 'package';
  }

  parse<PackageDependency, S extends SerializedDependency>(serialized: S): PackageDependency {
    // return new PackageDependency(serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType) as unknown as PackageDependency;
    return (new PackageDependency(
      serialized.id,
      serialized.version,
      serialized.__type,
      serialized.lifecycle as DependencyLifecycleType
    ) as unknown) as PackageDependency;
  }

  // parse: <PackageDependency, SerializedDependency>(serialized: SerializedDependency) =>  {
  //   return new PackageDependency(serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType);
  // }
}
