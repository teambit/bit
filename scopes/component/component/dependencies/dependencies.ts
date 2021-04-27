/* eslint-disable max-classes-per-file */
import { BitError } from '@teambit/bit-error';
import { BitId } from '@teambit/legacy-bit-id';

const DEV_ENV = 'development';
const RUNTIME_ENV = 'runtime';

// type Environment = DEV_ENV | RUNTIME_ENV;
type Environment = 'development' | 'runtime';
// type WrappingMethod = 'component' | 'package';

export class DependencyId extends BitId {}

export class Dependency {
  constructor(public id: DependencyId) {}
}

export class PackageDependency extends Dependency {}

export class ComponentDependency extends Dependency {}

export class DependencyList extends Array<Dependency> {
  /**
   * Get only package dependencies
   *
   * @readonly
   * @memberof DependencyList
   */
  get packages(): PackageDependency[] {
    return this.filter((dep) => dep instanceof PackageDependency);
  }

  get components(): ComponentDependency[] {
    return this.filter((dep) => dep instanceof ComponentDependency);
  }

  static fromArray(dependencies: Dependency[]): DependencyList {
    return new DependencyList(...dependencies);
  }
}

export class Dependencies {
  constructor(public runtime: DependencyList, public dev: DependencyList, public peer: DependencyList) {}

  private getByEnvironment(env: Environment): DependencyList {
    if (env === DEV_ENV) {
      return DependencyList.fromArray(this.runtime.concat(this.dev).concat(this.peer));
    }
    if (env === RUNTIME_ENV) {
      return DependencyList.fromArray(this.runtime.concat(this.peer));
    }
    throw new BitError(`env ${env} is not supported`);
  }

  /**
   * Get dependencies needed for development environnement such as runtime, dev and peer
   *
   * @returns {DependencyList}
   * @memberof Dependencies
   */
  computeDev(): DependencyList {
    return this.getByEnvironment(DEV_ENV);
  }

  /**
   * Get dependencies needed for runtime environnement such as runtime and peer
   *
   * @returns {DependencyList}
   * @memberof Dependencies
   */
  computeRuntime(): DependencyList {
    return this.getByEnvironment(RUNTIME_ENV);
  }
}
