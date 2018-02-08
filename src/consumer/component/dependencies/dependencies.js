/** @flow */
import R from 'ramda';
import { Dependency } from './';
import { RelativePath } from './dependency';
import { COMPONENT_ORIGINS } from '../../../constants';
import Consumer from '../../consumer';
import Component from '../consumer-component';
import { BitId } from '../../../bit-id';
import Scope from '../../../scope/scope';

export default class Dependencies {
  dependencies: Dependency[];

  constructor(dependencies: Dependency[] = []) {
    this.dependencies = this.deserialize(dependencies);
  }

  serialize() {
    return this.dependencies.map(dep => Object.assign({}, dep, { id: dep.id.toString() }));
  }

  get() {
    return this.dependencies;
  }

  deserialize(dependencies) {
    return dependencies.map(dependency => ({
      id: R.is(String, dependency.id) ? BitId.parse(dependency.id) : dependency.id,
      relativePaths: dependency.relativePaths || [
        // backward compatibility. (previously, it was "relativePath" without the ending 's' and was not an array.
        { sourceRelativePath: dependency.relativePath, destinationRelativePath: dependency.relativePath }
      ]
    }));
  }

  toStringOfIds() {
    return this.dependencies.map(dep => dep.id.toString());
  }

  isEmpty() {
    return !this.dependencies.length;
  }

  asWritableObject() {
    return R.mergeAll(this.dependencies.map(dependency => dependency.id.toObject()));
  }

  cloneAsString() {
    return this.dependencies.map((dependency) => {
      const dependencyClone = R.clone(dependency);
      dependencyClone.id = dependency.id.toString();
      return dependencyClone;
    });
  }

  stripOriginallySharedDir(bitMap, originallySharedDir) {
    const pathWithoutSharedDir = (pathStr, sharedDir) => {
      if (!sharedDir) return pathStr;
      const partToRemove = `${sharedDir}/`;
      return pathStr.replace(partToRemove, '');
    };
    this.dependencies.forEach((dependency) => {
      const dependencyId = dependency.id.toString();
      const depFromBitMap = bitMap.getComponent(dependencyId);
      dependency.relativePaths.forEach((relativePath: RelativePath) => {
        relativePath.sourceRelativePath = pathWithoutSharedDir(relativePath.sourceRelativePath, originallySharedDir);
        if (depFromBitMap && depFromBitMap.origin === COMPONENT_ORIGINS.IMPORTED) {
          relativePath.destinationRelativePath = pathWithoutSharedDir(
            relativePath.destinationRelativePath,
            depFromBitMap.originallySharedDir
          );
        }
      });
    });
  }

  getSourcesPaths() {
    return R.flatten(
      this.dependencies.map(dependency => dependency.relativePaths.map(relativePath => relativePath.sourceRelativePath))
    );
  }

  getDependenciesComponents(consumer: Consumer, component: Component): Promise<Component[]> {
    const getDependencies = () => {
      return this.dependencies.map((dependency) => {
        if (consumer.bitMap.isExistWithSameVersion(dependency.id)) {
          return consumer.loadComponent(dependency.id);
        }
        // when dependencies are imported as npm packages, they are not in bit.map
        component.dependenciesSavedAsComponents = false;
        return consumer.scope.loadComponent(dependency.id, false);
      });
    };
    return Promise.all(getDependencies());
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
}
