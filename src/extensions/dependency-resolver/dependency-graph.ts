import { Component } from '../component';
import ConsumerComponent from '../../consumer/component';
import { Dependencies, DependenciesFilterFunction } from '../../consumer/component/dependencies';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { BitId } from '../../bit-id';
import { DependenciesObjectDefinition } from './types';

// TODO: consider raname this class, it's not really a graph since it has only the first level
export class DependencyGraph {
  constructor(private component: Component) {}

  toJson(filterFunc?: DependenciesFilterFunction): DependenciesObjectDefinition {
    const consumerComponent: ConsumerComponent = this.component.state._consumer;

    const json = {
      devDependencies: {
        ...this.toPackageJson(this.component, consumerComponent.devDependencies),
        ...consumerComponent.packageDependencies,
      },
      dependencies: {
        ...this.toPackageJson(this.component, consumerComponent.dependencies, filterFunc),
        ...consumerComponent.devPackageDependencies,
      },
      peerDependencies: {
        ...consumerComponent.peerPackageDependencies,
      },
    };
    return json;
  }

  private toPackageJson(component: Component, dependencies: Dependencies, filterFunc?: DependenciesFilterFunction) {
    let dependenciesToUse = dependencies;
    if (filterFunc && typeof filterFunc === 'function') {
      dependenciesToUse = dependencies.filter(filterFunc);
    }
    const newVersion = '0.0.1-new';
    return dependenciesToUse.getAllIds().reduce((acc, depId: BitId) => {
      const dependencyVersion = depId.hasVersion() ? depId.version : newVersion;
      const packageName = componentIdToPackageName({
        ...component.state._consumer,
        id: depId,
        isDependency: true,
      });
      acc[packageName] = dependencyVersion;
      return acc;
    }, {});
  }
}
