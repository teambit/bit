import mapSeries from 'p-map-series';
import R from 'ramda';
import { ManipulateDirItem } from '../consumer/component-ops/manipulate-dir';
import ComponentWithDependencies from './component-dependencies';
import ComponentVersion from './component-version';
import { ObjectItem } from './objects/object-list';
import Repository from './objects/repository';

export default class VersionDependencies {
  component: ComponentVersion;
  dependencies: ComponentVersion[];
  devDependencies: ComponentVersion[];
  extensionsDependencies: ComponentVersion[];
  allDependencies: ComponentVersion[];
  sourceScope: string | null | undefined;

  constructor(
    component: ComponentVersion,
    dependencies: ComponentVersion[],
    devDependencies: ComponentVersion[],
    extensionsDependencies: ComponentVersion[],
    sourceScope: string
  ) {
    this.component = component;
    this.dependencies = dependencies;
    this.devDependencies = devDependencies;
    this.extensionsDependencies = extensionsDependencies;
    this.allDependencies = [...this.dependencies, ...this.devDependencies, ...this.extensionsDependencies];
    this.sourceScope = sourceScope;
  }

  async toConsumer(
    repo: Repository,
    manipulateDirData: ManipulateDirItem[] | null | undefined
  ): Promise<ComponentWithDependencies> {
    const depToConsumer = (dep) => dep.toConsumer(repo, manipulateDirData);
    const dependenciesP = Promise.all(this.dependencies.map(depToConsumer));
    const devDependenciesP = Promise.all(this.devDependencies.map(depToConsumer));
    const extensionDependenciesP = Promise.all(this.extensionsDependencies.map(depToConsumer));
    const componentP = this.component.toConsumer(repo, manipulateDirData);
    const [component, dependencies, devDependencies, extensionDependencies] = await Promise.all([
      componentP,
      dependenciesP,
      devDependenciesP,
      extensionDependenciesP,
    ]);
    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies,
      extensionDependencies,
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
