/** @flow */
import R from 'ramda';
import ComponentWithDependencies from './component-dependencies';
import ComponentVersion from './component-version';
import ComponentObjects from './component-objects';
import Repository from './objects/repository';

export default class VersionDependencies {
  component: ComponentVersion;
  dependencies: ComponentVersion[];
  sourceScope: ?string;

  constructor(component: ComponentVersion, dependencies: ComponentVersion[], sourceScope: string) {
    this.component = component;
    this.dependencies = dependencies;
    this.sourceScope = sourceScope;
  }

  getAllIds() {
    const componentId = this.component.id.toString();
    const dependenciesIds = this.dependencies.map(dep => dep.id.toString());
    return R.concat([componentId], dependenciesIds);
  }

  toConsumer(repo: Repository): Promise<ComponentWithDependencies> {
    const dependenciesP = Promise.all(this.dependencies.map(dep => dep.toConsumer(repo)));
    const componentP = this.component.toConsumer(repo);
    return Promise.all([componentP, dependenciesP]).then(
      ([component, dependencies]) =>
        new ComponentWithDependencies({
          component,
          dependencies
        })
    );
  }

  toObjects(repo: Repository): Promise<ComponentObjects> {
    const depsP = Promise.all(this.dependencies.map(dep => dep.toObjects(repo)));
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
