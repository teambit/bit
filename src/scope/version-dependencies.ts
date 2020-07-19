import ComponentWithDependencies from './component-dependencies';
import ComponentVersion from './component-version';
import ComponentObjects from './component-objects';
import Repository from './objects/repository';
import { ManipulateDirItem } from '../consumer/component-ops/manipulate-dir';

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

  toObjects(
    repo: Repository,
    clientVersion: string | null | undefined,
    collectParents: boolean
  ): Promise<ComponentObjects> {
    const depsP = Promise.all(this.allDependencies.map((dep) => dep.toObjects(repo, clientVersion, collectParents)));
    const compP = this.component.toObjects(repo, clientVersion, collectParents);

    return Promise.all([compP, depsP]).then(([component, dependencies]) => {
      const flattened = dependencies.reduce((array, compObjects) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        array.push(...compObjects.objects.concat([compObjects.component]));
        return array;
      }, []);

      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return new ComponentObjects(component.component, flattened.concat(component.objects));
    });
  }
}
