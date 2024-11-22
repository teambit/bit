import R from 'ramda';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitIdStr } from '@teambit/legacy-bit-id';
import ValidationError from '../../../error/validation-error';
import Scope from '../../../scope/scope';
import { fetchRemoteVersions } from '@teambit/scope.remotes';
import { isValidPath } from '@teambit/legacy.utils';
import Dependency from './dependency';
import { validateType } from '../../../scope/validate-type';

export const DEPENDENCIES_TYPES = ['dependencies', 'devDependencies'];
export const DEPENDENCIES_TYPES_UI_MAP = {
  dependencies: 'prod',
  devDependencies: 'dev',
};

export type DependenciesFilterFunction = (dependency: Dependency) => boolean;

export default class Dependencies {
  constructor(readonly dependencies: Dependency[] = []) {}

  serialize(): Record<string, any>[] {
    return this.dependencies.map((dep) => Object.assign({}, dep, { id: dep.id.toString() }));
  }

  get(): Dependency[] {
    return this.dependencies;
  }

  filter(fn: DependenciesFilterFunction): Dependencies {
    const filtered = this.dependencies.filter(fn);
    return new Dependencies(filtered);
  }

  sort() {
    this.dependencies.sort((a, b) => {
      const idA = a.id.toString();
      const idB = b.id.toString();
      if (idA < idB) {
        return -1;
      }
      if (idA > idB) {
        return 1;
      }
      return 0;
    });
  }

  getClone(): Dependency[] {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.dependencies.map((dependency) => Dependency.getClone(dependency));
  }

  add(dependency: Dependency) {
    this.dependencies.push(dependency);
  }

  toStringOfIds(): string[] {
    return this.dependencies.map((dep) => dep.id.toString());
  }

  isEmpty(): boolean {
    return !this.dependencies.length;
  }

  cloneAsString(): Record<string, any>[] {
    return this.dependencies.map((dependency) => {
      const dependencyClone = R.clone(dependency);
      dependencyClone.id = dependency.id.toString();
      return dependencyClone;
    });
  }

  cloneAsObject(): Record<string, any>[] {
    return this.dependencies.map((dependency) => {
      const dependencyClone = R.clone(dependency);
      dependencyClone.id = dependency.id.serialize();
      return dependencyClone;
    });
  }

  getById(id: ComponentID): Dependency | null | undefined {
    return this.dependencies.find((dep) => dep.id.isEqual(id));
  }

  getByIdStr(id: BitIdStr): Dependency | null | undefined {
    return this.dependencies.find((dep) => dep.id.toString() === id);
  }

  getBySourcePath(sourcePath: string): Dependency | null | undefined {
    return this.dependencies.find((dependency) =>
      dependency.relativePaths.some((relativePath) => {
        return relativePath.sourceRelativePath === sourcePath;
      })
    );
  }

  getAllIds(): ComponentIdList {
    return ComponentIdList.fromArray(this.dependencies.map((dependency) => dependency.id));
  }

  getIdsMap(): Record<string, ComponentID> {
    const result = {};
    this.dependencies.forEach((dep) => {
      result[dep.id.toString()] = dep.id;
    });
    return result;
  }

  async addRemoteAndLocalVersions(scope: Scope, modelDependencies: Dependencies) {
    const dependenciesIds = this.dependencies.map((dependency) => dependency.id);
    const localDependencies = await scope.latestVersions(dependenciesIds);
    const remoteVersionsDependencies = await fetchRemoteVersions(scope, dependenciesIds);

    this.dependencies.forEach((dependency) => {
      const remoteVersionId = remoteVersionsDependencies.find((remoteId) =>
        remoteId.isEqualWithoutVersion(dependency.id)
      );
      const localVersionId = localDependencies.find((localId) => localId.isEqualWithoutVersion(dependency.id));
      const modelVersionId = modelDependencies
        .get()
        .find((modelDependency) => modelDependency.id.isEqualWithoutVersion(dependency.id));
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependency.remoteVersion = remoteVersionId ? remoteVersionId.version : null;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependency.localVersion = localVersionId ? localVersionId.version : null;
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependency.currentVersion = modelVersionId ? modelVersionId.id.version : dependency.id.version;
    });
  }

  validate(bitId?: ComponentID): void {
    const compIdStr = bitId ? ` of ${bitId.toString()}` : '';
    let message = `failed validating the dependencies${compIdStr}.`;
    validateType(message, this.dependencies, 'dependencies', 'array');
    const allIds = this.getAllIds();
    this.dependencies.forEach((dependency) => {
      validateType(message, dependency, 'dependency', 'object');
      if (!dependency.id) throw new ValidationError('one of the dependencies is missing ID');
      if (!dependency.relativePaths) {
        throw new ValidationError(`a dependency ${dependency.id.toString()} is missing relativePaths`);
      }
      const sameIds = allIds.filterExact(dependency.id);
      if (sameIds.length > 1) {
        throw new ValidationError(`a dependency ${dependency.id.toString()} is duplicated`);
      }
      if (bitId && bitId.isEqual(dependency.id)) {
        throw new ValidationError(
          `failed validating ${bitId.toString()}, one of the dependencies has the same id as the component`
        );
      }
      const permittedProperties = ['id', 'relativePaths', 'packageName', 'versionRange'];
      const currentProperties = Object.keys(dependency);
      currentProperties.forEach((currentProp) => {
        if (!permittedProperties.includes(currentProp)) {
          throw new ValidationError(
            `a dependency ${dependency.id.toString()} has an undetected property "${currentProp}"`
          );
        }
      });
      validateType(message, dependency.relativePaths, 'dependency.relativePaths', 'array');
      dependency.relativePaths.forEach((relativePath) => {
        message = `failed validating dependency ${dependency.id.toString()}.`;
        validateType(message, dependency, 'dependency', 'object');
        const requiredProps = ['sourceRelativePath', 'destinationRelativePath'];
        const pathProps = ['sourceRelativePath', 'destinationRelativePath'];
        const optionalProps = ['importSpecifiers', 'importSource'];
        const allProps = requiredProps.concat(optionalProps);
        requiredProps.forEach((prop) => {
          if (!relativePath[prop]) {
            throw new ValidationError(`${message} relativePaths.${prop} is missing`);
          }
        });
        pathProps.forEach((prop) => {
          if (!isValidPath(relativePath[prop])) {
            throw new ValidationError(`${message} relativePaths.${prop} has an invalid path ${relativePath[prop]}`);
          }
        });
        Object.keys(relativePath).forEach((prop) => {
          if (!allProps.includes(prop)) {
            throw new ValidationError(`${message} undetected property of relativePaths "${prop}"`);
          }
        });
        if (relativePath.importSpecifiers) {
          validateType(message, relativePath.importSpecifiers, 'relativePath.importSpecifiers', 'array');
          // $FlowFixMe it's already confirmed that relativePath.importSpecifiers is set
          relativePath.importSpecifiers.forEach((importSpecifier) => {
            validateType(message, importSpecifier, 'importSpecifier', 'object');
            if (!importSpecifier.mainFile) {
              throw new ValidationError(`${message} mainFile property is missing from the importSpecifier`);
            }
            const specifierProps = ['isDefault', 'name'].sort().toString();
            const mainFileProps = Object.keys(importSpecifier.mainFile).sort().toString();
            if (mainFileProps !== specifierProps) {
              throw new ValidationError(
                `${message} expected properties of importSpecifier.mainFile "${specifierProps}", got "${mainFileProps}"`
              );
            }
            const specifierPermittedProps = ['mainFile'];
            Object.keys(importSpecifier).forEach((prop) => {
              if (!specifierPermittedProps.includes(prop)) {
                throw new ValidationError(`${message} undetected property of importSpecifier "${prop}"`);
              }
            });
          });
        }
      });
    });
  }
}
