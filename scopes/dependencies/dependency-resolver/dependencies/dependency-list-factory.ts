import { DependencyFactory } from './dependency-factory';
import { SerializedDependency, DependencyLifecycleType } from './dependency';
import { DependencyList } from './dependency-list';
import LegacyComponent from 'bit-bin/dist/consumer/component';
import { UnknownDepType } from './exceptions';
import { Dependency as LegacyDependency } from 'bit-bin/dist/consumer/component/dependencies';
import { SerializedComponentDependency } from './component-dependency';
import { SerializedPackageDependency } from './package-dependency';

export class DependencyListFactory {
  constructor(private factories: Record<string, DependencyFactory>) {}

  fromSerializedDependencies(serializedDependencies: SerializedDependency[]): DependencyList {
    const dependencies = serializedDependencies.map((serializedDependency) => {
      const type = serializedDependency.__type;
      const factory = this.factories[type];
      if (!factory) {
        throw new UnknownDepType(type);
      }
      const dependency = factory.parse(serializedDependency);
      return dependency;
    });
    return new DependencyList(dependencies);
  }

  fromLegacyComponent(legacyComponent: LegacyComponent): DependencyList {
    const componentDepFactory = this.factories.component;
    const packageDepFactory = this.factories.package;

    const runtimeDeps = legacyComponent.dependencies
      .get()
      .map((dep) => transformLegacyComponentDepToSerializedDependency(dep, 'runtime'));
    const devDeps = legacyComponent.devDependencies
      .get()
      .map((dep) => transformLegacyComponentDepToSerializedDependency(dep, 'dev'));
    const serializedComponentDeps = runtimeDeps.concat(devDeps);
    const componentDeps = serializedComponentDeps.map(componentDepFactory.parse);
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
    const packageDeps = serializedPackageDeps.map(packageDepFactory.parse);
    const dependencyList = new DependencyList(componentDeps.concat(packageDeps));
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
    __type: 'component',
    lifecycle,
  };
}

function transformLegacyComponentPackageDepsToSerializedDependency(
  packageDepObj: Record<string, string>,
  lifecycle: DependencyLifecycleType
): SerializedPackageDependency[] {
  const res = Object.entries(packageDepObj).map(([packageName, version]) => {
    return {
      id: packageName,
      version,
      __type: 'package',
      lifecycle,
    };
  });
  return res;
}
