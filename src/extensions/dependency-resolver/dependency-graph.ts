import { Component } from '../component';
import ConsumerComponent from '../../consumer/component';
import { Dependencies } from '../../consumer/component/dependencies';
import componentIdToPackageName from '../../utils/bit/component-id-to-package-name';
import { BitId } from '../../bit-id';

export class DependencyGraph {
  constructor(private component: Component) {}

  toJson() {
    const consumerComponent: ConsumerComponent = this.component.state._consumer;

    return {
      devDependencies: this.toPackageJson(this.component, consumerComponent.devDependencies),
      dependencies: this.toPackageJson(this.component, consumerComponent.dependencies),
    };
  }

  private toPackageJson(component: Component, dependencies: Dependencies) {
    const newVersion = '0.0.1-new';
    return dependencies.getAllIds().reduce((acc, depId: BitId) => {
      const packageDependency = depId.hasVersion() ? depId.version : newVersion;
      const packageName = componentIdToPackageName({
        ...component.state._consumer,
        id: depId,
        isDependency: true,
      });
      acc[packageName] = packageDependency;
      return acc;
    }, {});
  }
}
