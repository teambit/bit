/** @flow */
import Component from './models/component';
import Version from './models/version';
import { BitId } from '../bit-id';
import Scope from './scope';
import Repository from './objects/repository';
import VersionDependencies from './version-dependencies';
import ComponentObjects from './component-objects';
import logger from '../logger/logger';
import ConsumerComponent from '../consumer/component';
import GeneralError from '../error/general-error';
import { HashMismatch } from './exceptions';

export default class ComponentVersion {
  component: Component;
  version: string;

  constructor(component: Component, version: string) {
    this.component = component;
    this.version = version;
  }

  getVersion(repository: Repository): Promise<Version> {
    return this.component.loadVersion(this.version, repository);
  }

  flattenedDependencies(repository: Repository): Promise<BitId[]> {
    return this.getVersion(repository).then(version => version.flattenedDependencies);
  }

  flattenedDevDependencies(repository: Repository): Promise<BitId[]> {
    return this.getVersion(repository).then(version => version.flattenedDevDependencies);
  }

  toId() {
    return new BitId({
      scope: this.component.scope,
      box: this.component.box,
      name: this.component.name,
      version: this.version
    });
  }

  get id(): BitId {
    return this.toId();
  }

  async toVersionDependencies(scope: Scope, source: string, withEnvironments?: boolean): Promise<VersionDependencies> {
    const version = await this.getVersion(scope.objects);
    if (!version) {
      logger.debug(
        `toVersionDependencies, component ${this.component.id().toString()}, version ${
          this.version
        } not found, going to fetch from a remote`
      );
      if (this.component.scope === scope.name) {
        // it should have been fetched locally, since it wasn't found, this is an error
        throw new GeneralError(
          `Version ${this.version} of ${this.component.id().toString()} was not found in scope ${scope.name}`
        );
      }
      return scope.remotes().then((remotes) => {
        const src = this.id;
        src.scope = source;
        return scope.getExternal({ id: src, remotes, localFetch: false, withEnvironments });
      });
    }

    logger.debug(
      `toVersionDependencies, component ${this.component.id().toString()}, version ${
        this.version
      } found, going to collect its dependencies`
    );
    const dependencies = await version.collectDependencies(scope, withEnvironments);
    const devDependencies = await version.collectDependencies(scope, withEnvironments, true);

    return new VersionDependencies(this, dependencies, devDependencies, source);
  }

  toConsumer(repo: Repository): Promise<ConsumerComponent> {
    return this.component.toConsumerComponent(this.version, this.component.scope, repo);
  }

  async toObjects(repo: Repository): Promise<ComponentObjects> {
    const version = await this.getVersion(repo);
    if (!version) throw new GeneralError(`failed loading version ${this.version} of ${this.component.id()}`);
    try {
      const [compObject, objects, versionBuffer, scopeMeta] = await Promise.all([
        this.component.asRaw(repo),
        version.collectRaw(repo),
        version.asRaw(repo),
        repo.getScopeMetaObject()
      ]);
      return new ComponentObjects(compObject, objects.concat([versionBuffer, scopeMeta]));
    } catch (err) {
      logger.error(err);
      const originalVersionHash = this.component.versions[this.version].toString();
      const currentVersionHash = version.hash().toString();
      if (originalVersionHash !== currentVersionHash) {
        throw new HashMismatch(this.component.id(), this.version, originalVersionHash, currentVersionHash);
      }
      throw err;
    }
  }
}
