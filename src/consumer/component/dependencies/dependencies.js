/** @flow */
import R from 'ramda';
import { Dependency } from './';
import type { RelativePath } from './dependency';
import { BitId } from '../../../bit-id';
import Scope from '../../../scope/scope';
import BitMap from '../../bit-map';
import { isValidPath } from '../../../utils';
import GeneralError from '../../../error/general-error';

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

  validate(): void {
    if (!Array.isArray(this.dependencies)) throw new GeneralError('dependencies must be an array');
    this.dependencies.forEach((dependency) => {
      if (!dependency.id) throw new GeneralError('one of the dependencies is missing ID');
      if (!dependency.relativePaths) {
        throw new GeneralError(`a dependency ${dependency.id.toString()} is missing relativePaths`);
      }
      dependency.relativePaths.forEach((relativePath) => {
        if (!relativePath.sourceRelativePath) {
          throw new GeneralError(
            `a dependency ${dependency.id.toString()} is missing relativePaths.sourceRelativePath`
          );
        }
        if (!relativePath.destinationRelativePath) {
          throw new GeneralError(
            `a dependency ${dependency.id.toString()} is missing relativePaths.destinationRelativePath`
          );
        }
        if (!isValidPath(relativePath.sourceRelativePath)) {
          throw new GeneralError(
            `a dependency ${dependency.id.toString()} has an invalid sourceRelativePath ${
              relativePath.sourceRelativePath
            }`
          );
        }
        if (!isValidPath(relativePath.destinationRelativePath)) {
          throw new GeneralError(
            `a dependency ${dependency.id.toString()} has an invalid destinationRelativePath ${
              relativePath.destinationRelativePath
            }`
          );
        }
        if (relativePath.isCustomResolveUsed) {
          if (!relativePath.importSource) {
            throw new Error(`a dependency ${dependency.id.toString()} is missing relativePath.importSource`);
          }
        }
      });
    });
  }
}
