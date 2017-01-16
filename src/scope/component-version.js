/** @flow */
import Component from './models/component';
import Version from './models/version';
import { BitId } from '../bit-id';
import Scope from './scope';
import Repository from './objects/repository';
import VersionDependencies from './version-dependencies';
import ComponentObjects from './component-objects';

export default class ComponentVersion {
  component: Component;
  version: number;

  constructor(component: Component, version: number) {
    this.component = component;
    this.version = version;
  }

  getVersion(repository: Repository): Promise<Version> {
    return this.component.loadVersion(this.version, repository);
  }

  toId() {
    return new BitId({
      scope: this.component.scope,
      box: this.component.box,
      name: this.component.name,
      version: this.version.toString()
    });
  }
  
  get id(): BitId {
    return this.toId();
  }

  toVersionDependencies(scope: Scope): Promise<VersionDependencies> {
    return this.getVersion(scope.objects)
      .then((version) => {
        return version.collectDependencies(scope);
      })
      .then(dependencies => new VersionDependencies(this, dependencies));
  }

  toConsumer(repo: Repository) {
    return this.component.toConsumerComponent(this.version.toString(), this.component.scope, repo);
  }

  toObjects(repo: Repository): Promise<ComponentObjects> {
    return this.getVersion(repo)
      .then(version => Promise.all([
        this.component.asRaw(repo), 
        version.collectRaw(repo),
        version.asRaw(repo)
      ]))
      .then(([compObject, objects, version]) => new ComponentObjects(
        compObject,
        objects.concat([version])
      ));
  }
}
