/** @flow */
import R from 'ramda';
import { Dependency } from './';
import type { RelativePath } from './dependency';
import { BitId } from '../../../bit-id';
import Scope from '../../../scope/scope';
import BitMap from '../../bit-map';
import { isValidPath } from '../../../utils';
import ValidationError from '../../../error/validation-error';
import validateType from '../../../utils/validate-type';

export default class Dependencies {
  dependencies: Dependency[];

  constructor(dependencies: Dependency[] = []) {
    this.dependencies = this.deserialize(dependencies);
  }

  serialize(): Object[] {
    return this.dependencies.map(dep => Object.assign({}, dep, { id: dep.id.toString() }));
  }

  get(): Dependency[] {
    return this.dependencies;
  }

  getClone(): Dependency[] {
    return this.dependencies.map(dependency => Dependency.getClone(dependency));
  }

  add(dependency: Dependency) {
    this.dependencies.push(dependency);
  }

  deserialize(dependencies: Dependency[]): Dependency[] {
    return dependencies.map(dependency => ({
      id: R.is(String, dependency.id) ? BitId.parse(dependency.id) : dependency.id,
      relativePaths: dependency.relativePaths || [
        // backward compatibility. (previously, it was "relativePath" without the ending 's' and was not an array.
        { sourceRelativePath: dependency.relativePath, destinationRelativePath: dependency.relativePath }
      ]
    }));
  }

  toStringOfIds(): string[] {
    return this.dependencies.map(dep => dep.id.toString());
  }

  isEmpty(): boolean {
    return !this.dependencies.length;
  }

  asWritableObject() {
    return R.mergeAll(this.dependencies.map(dependency => dependency.id.toObject()));
  }

  cloneAsString(): Object[] {
    return this.dependencies.map((dependency) => {
      const dependencyClone = R.clone(dependency);
      dependencyClone.id = dependency.id.toString();
      return dependencyClone;
    });
  }

  stripOriginallySharedDir(bitMap: BitMap, originallySharedDir: string): void {
    this.dependencies.forEach((dependency) => {
      Dependency.stripOriginallySharedDir(dependency, bitMap, originallySharedDir);
    });
  }

  /**
   * needed for calculating the originallySharedDir. when isCustomResolveUsed, don't take into
   * account the dependencies as they don't have relative paths
   */
  getSourcesPaths(): string[] {
    return R.flatten(
      this.dependencies.map(dependency =>
        dependency.relativePaths
          .map((relativePath) => {
            return relativePath.isCustomResolveUsed ? null : relativePath.sourceRelativePath;
          })
          .filter(x => x)
      )
    );
  }

  getById(id: string): Dependency {
    return this.dependencies.find(dep => dep.id.toString() === id);
  }

  async addRemoteAndLocalVersions(scope: Scope, modelDependencies: Dependencies) {
    const dependenciesIds = this.dependencies.map(dependency => dependency.id);
    const localDependencies = await scope.latestVersions(dependenciesIds);
    const remoteVersionsDependencies = await scope.fetchRemoteVersions(dependenciesIds);

    this.dependencies.forEach((dependency) => {
      const dependencyIdWithoutVersion = dependency.id.toStringWithoutVersion();
      const remoteVersionId = remoteVersionsDependencies.find(
        remoteId => remoteId.toStringWithoutVersion() === dependencyIdWithoutVersion
      );
      const localVersionId = localDependencies.find(
        localId => localId.toStringWithoutVersion() === dependencyIdWithoutVersion
      );
      const modelVersionId = modelDependencies
        .get()
        .find(modelDependency => modelDependency.id.toStringWithoutVersion() === dependencyIdWithoutVersion);
      dependency.remoteVersion = remoteVersionId ? remoteVersionId.version : null;
      dependency.localVersion = localVersionId ? localVersionId.version : null;
      dependency.currentVersion = modelVersionId ? modelVersionId.id.version : dependency.id.version;
    });
  }

  getCustomResolvedData(): { [import_source: string]: BitId } {
    const importSourceMap = {};
    this.dependencies.forEach((dependency: Dependency) => {
      dependency.relativePaths.forEach((relativePath: RelativePath) => {
        if (relativePath.isCustomResolveUsed) {
          if (!relativePath.importSource) {
            throw new Error(
              `${dependency.id.toString()} relativePath.importSource must be set when relativePath.isCustomResolveUsed`
            );
          }
          importSourceMap[relativePath.importSource] = dependency.id;
        }
      });
    });
    return importSourceMap;
  }

  isCustomResolvedUsed(): boolean {
    return this.dependencies.some((dependency: Dependency) => {
      return dependency.relativePaths.some((relativePath: RelativePath) => relativePath.isCustomResolveUsed);
    });
  }

  validate(): void {
    let message = 'failed validating the dependencies.';
    validateType(message, this.dependencies, 'dependencies', 'array');
    this.dependencies.forEach((dependency) => {
      validateType(message, dependency, 'dependency', 'object');
      if (!dependency.id) throw new ValidationError('one of the dependencies is missing ID');
      if (!dependency.relativePaths) {
        throw new ValidationError(`a dependency ${dependency.id.toString()} is missing relativePaths`);
      }
      const permittedProperties = ['id', 'relativePaths'];
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
        const optionalProps = ['importSpecifiers', 'isCustomResolveUsed', 'importSource'];
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
        if (relativePath.isCustomResolveUsed) {
          if (!relativePath.importSource) {
            throw new ValidationError(`a dependency ${dependency.id.toString()} is missing relativePath.importSource`);
          }
          validateType(message, relativePath.importSource, 'relativePath.importSource', 'string');
        }
        if (relativePath.importSpecifiers) {
          validateType(message, relativePath.importSpecifiers, 'relativePath.importSpecifiers', 'array');
          relativePath.importSpecifiers.forEach((importSpecifier) => {
            validateType(message, importSpecifier, 'importSpecifier', 'object');
            if (!importSpecifier.mainFile) {
              throw new ValidationError(`${message} mainFile property is missing from the importSpecifier`);
            }
            const specifierProps = ['isDefault', 'name'].sort().toString();
            const mainFileProps = Object.keys(importSpecifier.mainFile)
              .sort()
              .toString();
            if (mainFileProps !== specifierProps) {
              throw new ValidationError(
                `${message} expected properties of importSpecifier.mainFile "${specifierProps}", got "${mainFileProps}"`
              );
            }
            if (importSpecifier.linkFile) {
              const linkFileProps = Object.keys(importSpecifier.linkFile)
                .sort()
                .toString();
              if (linkFileProps !== specifierProps) {
                throw new ValidationError(
                  `${message} expected properties of importSpecifier.linkFile "${specifierProps}", got "${mainFileProps}"`
                );
              }
            }
            const specifierPermittedProps = ['mainFile', 'linkFile'];
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
