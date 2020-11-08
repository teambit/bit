import {
  DependencyLifecycleType,
  SerializedDependency,
  DependencyFactory,
  DependencyList,
} from '@teambit/dependency-resolver';
import { PackageDependency, SerializedPackageDependency } from './package-dependency';
import LegacyComponent from 'bit-bin/dist/consumer/component';

const TYPE = 'package';
// TODO: think about where is the right place to put this
export class PackageDependencyFactory implements DependencyFactory {
  // parse<PackageDependency, SerializedDependency>(serialized: SerializedDependency): PackageDependency {
  //   return new PackageDependency(serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType);
  // }
  type: string;

  constructor() {
    this.type = TYPE;
  }

  parse<PackageDependency, S extends SerializedDependency>(serialized: S): PackageDependency {
    // return new PackageDependency(serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType) as unknown as PackageDependency;
    return (new PackageDependency(
      serialized.id,
      serialized.version,
      serialized.lifecycle as DependencyLifecycleType
    ) as unknown) as PackageDependency;
  }

  fromLegacyComponent(legacyComponent: LegacyComponent): DependencyList {
    const runtimePackageDeps = transformLegacyComponentPackageDepsToSerializedDependency(
      legacyComponent.packageDependencies,
      'runtime'
    );
    const devPackageDeps = transformLegacyComponentPackageDepsToSerializedDependency(
      legacyComponent.devPackageDependencies,
      'dev'
    );
    const peerPackageDeps = transformLegacyComponentPackageDepsToSerializedDependency(
      legacyComponent.peerPackageDependencies,
      'peer'
    );
    const serializedPackageDeps = runtimePackageDeps.concat(devPackageDeps).concat(peerPackageDeps);
    const packageDeps: PackageDependency[] = serializedPackageDeps.map((dep) => this.parse(dep));
    const dependencyList = new DependencyList(packageDeps);
    return dependencyList;
  }

  // parse: <PackageDependency, SerializedDependency>(serialized: SerializedDependency) =>  {
  //   return new PackageDependency(serialized.id, serialized.version, serialized.type, serialized.lifecycle as DependencyLifecycleType);
  // }
}

function transformLegacyComponentPackageDepsToSerializedDependency(
  packageDepObj: Record<string, string>,
  lifecycle: DependencyLifecycleType
): SerializedPackageDependency[] {
  const res = Object.entries(packageDepObj).map(([packageName, version]) => {
    return {
      id: packageName,
      version,
      __type: TYPE,
      lifecycle,
    };
  });
  return res;
}
