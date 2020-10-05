import { Dependency } from './dependency';
import { PackageDependency } from './package-dependency';
import { ComponentDependency } from './component-dependency';
import LegacyComponent from 'bit-bin/dist/consumer/component';

export class DependencyList {
  constructor(private _dependencies: Array<T extends Dependency>){}
  // constructor(private _dependencies: Dependency[]){}

  get dependencies(): Dependency[]{
    return this._dependencies;
  }

  /**
   * Get only package dependencies
   *
   * @readonly
   * @memberof DependencyList
   */
  get packages(): PackageDependency[] {
    return this.dependencies.filter((dep) => dep instanceof PackageDependency);
  }

  get components(): ComponentDependency[] {
    return this.dependencies.filter((dep) => dep instanceof ComponentDependency);
  }

  serialize() {

  }

  static fromArray(dependencies: Dependency[]): DependencyList {
    return new DependencyList(dependencies);
  }

  static parse(){

  }

  static fromLegacyComponent(legacyComponent: LegacyComponent): DependencyList {

  }
}


