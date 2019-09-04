/** @flow */
import semver from 'semver';
import R from 'ramda';
import type ModelComponent from './models/model-component';
import type Version from './models/version';
import { BitId, BitIds } from '../bit-id';
import Repository from './objects/repository';
import ComponentObjects from './component-objects';
import logger from '../logger/logger';
import type ConsumerComponent from '../consumer/component';
import GeneralError from '../error/general-error';
import { HashMismatch } from './exceptions';
import type { ManipulateDirItem } from '../consumer/component-ops/manipulate-dir';
import CustomError from '../error/custom-error';

export default class ComponentVersion {
  +component: ModelComponent;
  +version: string;

  constructor(component: ModelComponent, version: string) {
    if (!version) {
      throw new TypeError(`ComponentVersion expects "version" to be defined (failed for ${component.id()})`);
    }
    this.component = component;
    this.version = version;
    Object.freeze(this);
  }

  getVersion(repository: Repository): Promise<Version> {
    return this.component.loadVersion(this.version, repository);
  }

  flattenedDependencies(repository: Repository): Promise<BitIds> {
    return this.getVersion(repository).then(version => version.flattenedDependencies);
  }

  flattenedDevDependencies(repository: Repository): Promise<BitIds> {
    return this.getVersion(repository).then(version => version.flattenedDevDependencies);
  }

  flattenedCompilerDependencies(repository: Repository): Promise<BitIds> {
    return this.getVersion(repository).then(version => version.flattenedCompilerDependencies);
  }

  flattenedTesterDependencies(repository: Repository): Promise<BitIds> {
    return this.getVersion(repository).then(version => version.flattenedTesterDependencies);
  }

  toId(): BitId {
    return new BitId({
      scope: this.component.scope,
      name: this.component.name,
      version: this.version
    });
  }

  get id(): BitId {
    return this.toId();
  }

  toConsumer(repo: Repository, manipulateDirData: ?(ManipulateDirItem[])): Promise<ConsumerComponent> {
    // $FlowFixMe
    return this.component.toConsumerComponent(this.version, this.component.scope, repo, manipulateDirData);
  }

  async toObjects(repo: Repository, clientVersion: ?string): Promise<ComponentObjects> {
    const version = await this.getVersion(repo);
    if (!version) throw new GeneralError(`failed loading version ${this.version} of ${this.component.id()}`);
    // @todo: remove this customError once upgrading to v15, because when the server has v15
    // and the client has < 15, the client will get anyway an error to upgrade the version
    if (clientVersion && version.overrides && !R.isEmpty(version.overrides) && semver.lt(clientVersion, '14.1.0')) {
      throw new CustomError(`Your components were created with a newer version and use the "overrides" feature.
Please upgrade your bit client to version >= v14.1.0`);
    }
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
