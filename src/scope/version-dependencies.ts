import mapSeries from 'p-map-series';
import R from 'ramda';
import { BitId, BitIds } from '../bit-id';
import { ManipulateDirItem } from '../consumer/component-ops/manipulate-dir';
import ComponentWithDependencies from './component-dependencies';
import ComponentVersion from './component-version';
import { DependenciesNotFound } from './exceptions/dependencies-not-found';
import { Version } from './models';
import { ObjectItem } from './objects/object-list';
import Repository from './objects/repository';

export default class VersionDependencies {
  constructor(
    public component: ComponentVersion,
    private dependencies: ComponentVersion[],
    public sourceScope: string,
    public version: Version
  ) {}

  get allDependencies(): ComponentVersion[] {
    return this.dependencies;
  }

  get allDependenciesIds(): BitIds {
    return BitIds.fromArray(this.dependencies.map((dep) => dep.id));
  }

  getMissingDependencies(): BitId[] {
    const allDepsIds = this.allDependenciesIds;
    return this.version.flattenedDependencies.filter((id) => !allDepsIds.has(id));
  }

  throwForMissingDependencies() {
    const missing = this.getMissingDependencies();
    if (missing.length) {
      throw new DependenciesNotFound(
        this.component.id.toString(),
        missing.map((m) => m.toString())
      );
    }
  }

  async toConsumer(
    repo: Repository,
    manipulateDirData: ManipulateDirItem[] | null | undefined
  ): Promise<ComponentWithDependencies> {
    const depToConsumer = (dep) => dep.toConsumer(repo, manipulateDirData);
    const dependenciesP = Promise.all(this.dependencies.map(depToConsumer));
    const componentP = this.component.toConsumer(repo, manipulateDirData);
    const [component, dependencies] = await Promise.all([componentP, dependenciesP]);
    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies: [],
      extensionDependencies: [],
      missingDependencies: this.getMissingDependencies(),
    });
  }

  async toObjects(
    repo: Repository,
    clientVersion: string | null | undefined,
    collectParents: boolean,
    collectArtifacts: boolean
  ): Promise<ObjectItem[]> {
    // for the dependencies, don't collect parents they might not exist
    const depsP = mapSeries(this.allDependencies, (dep) => dep.toObjects(repo, clientVersion, false, collectArtifacts));
    const compP = this.component.toObjects(repo, clientVersion, collectParents, collectArtifacts);
    const [component, dependencies] = await Promise.all([compP, depsP]);
    return [...component, ...R.flatten(dependencies)];
  }
}
