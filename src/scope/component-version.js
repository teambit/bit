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

  flattenedDependencies(repository: Repository): Promise<BitId[]> {
    return this.getVersion(repository)
      .then(version => version.flattenedDependencies);
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

  toVersionDependencies(scope: Scope, source: string, withDependencies?: bool):
  Promise<VersionDependencies> {
    return this.getVersion(scope.objects)
      .then((version) => {
        if (!version) {
          return scope.remotes()
            .then((remotes) => {
              const src = this.id;
              src.scope = source;
              return scope.getExternal({ id: src, remotes, localFetch: false, withDependencies });
            });
        }

        return version.collectDependencies(scope, withDependencies)
          .then(dependencies => new VersionDependencies(this, dependencies, source));
      });
  }

  toConsumer(repo: Repository) {
    return this.component.toConsumerComponent(this.version.toString(), this.component.scope, repo);
  }

  toObjects(repo: Repository): Promise<ComponentObjects> {
    return this.getVersion(repo)
      .then(version => Promise.all([
        this.component.asRaw(repo),
        version.collectRaw(repo),
        version.asRaw(repo),
        repo.getScopeMetaObject()
      ]))
      .then(([compObject, objects, version, scopeMeta]) => new ComponentObjects(
        compObject,
        objects.concat([version, scopeMeta])
      ));
  }
}
