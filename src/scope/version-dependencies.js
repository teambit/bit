/** @flow */
import ComponentWithDependencies from './component-dependencies';
import ComponentVersion from './component-version';
import ComponentObjects from './component-objects';
import Repository from './objects/repository';

export default class VersionDependencies {
  component: ComponentVersion;
  dependencies: ComponentVersion[];
  devDependencies: ComponentVersion[];
  compilerDependencies: ComponentVersion[];
  testerDependencies: ComponentVersion[];
  allDependencies: ComponentVersion[];
  sourceScope: ?string;

  constructor(
    component: ComponentVersion,
    dependencies: ComponentVersion[],
    devDependencies: ComponentVersion[],
    compilerDependencies: ComponentVersion[],
    testerDependencies: ComponentVersion[],
    sourceScope: string
  ) {
    this.component = component;
    this.dependencies = dependencies;
    this.devDependencies = devDependencies;
    this.compilerDependencies = compilerDependencies;
    this.testerDependencies = testerDependencies;
    this.allDependencies = [
      ...this.dependencies,
      ...this.devDependencies,
      ...this.compilerDependencies,
      ...this.testerDependencies
    ];
    this.sourceScope = sourceScope;
  }

  async toConsumer(repo: Repository): Promise<ComponentWithDependencies> {
    const dependenciesP = Promise.all(this.dependencies.map(dep => dep.toConsumer(repo)));
    const devDependenciesP = Promise.all(this.devDependencies.map(dep => dep.toConsumer(repo)));
    const compilerDependenciesP = Promise.all(this.compilerDependencies.map(dep => dep.toConsumer(repo)));
    const testerDependenciesP = Promise.all(this.testerDependencies.map(dep => dep.toConsumer(repo)));
    const componentP = this.component.toConsumer(repo);
    const [component, dependencies, devDependencies, compilerDependencies, testerDependencies] = await Promise.all([
      componentP,
      dependenciesP,
      devDependenciesP,
      compilerDependenciesP,
      testerDependenciesP
    ]);
    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies
    });
  }

  toObjects(repo: Repository): Promise<ComponentObjects> {
    const depsP = Promise.all(this.allDependencies.map(dep => dep.toObjects(repo)));
    const compP = this.component.toObjects(repo);

    return Promise.all([compP, depsP]).then(([component, dependencies]) => {
      const flattened = dependencies.reduce((array, compObjects) => {
        array.push(...compObjects.objects.concat([compObjects.component]));
        return array;
      }, []);

      return new ComponentObjects(component.component, flattened.concat(component.objects));
    });
  }
}
