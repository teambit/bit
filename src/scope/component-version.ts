import R from 'ramda';
import semver from 'semver';

import { BitId, BitIds } from '../bit-id';
import ConsumerComponent from '../consumer/component';
import { ManipulateDirItem } from '../consumer/component-ops/manipulate-dir';
import CustomError from '../error/custom-error';
import ShowDoctorError from '../error/show-doctor-error';
import logger from '../logger/logger';
import { getAllVersionHashes } from './component-ops/traverse-versions';
import { HashMismatch } from './exceptions';
import ModelComponent from './models/model-component';
import Version from './models/version';
import { ObjectItem } from './objects/object-list';
import Repository from './objects/repository';

export default class ComponentVersion {
  readonly component: ModelComponent;
  readonly version: string;

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
    return this.getVersion(repository).then((version) => version.flattenedDependencies);
  }

  flattenedDevDependencies(repository: Repository): Promise<BitIds> {
    return this.getVersion(repository).then((version) => version.flattenedDevDependencies);
  }

  toId(): BitId {
    return new BitId({
      scope: this.component.scope,
      name: this.component.name,
      version: this.version,
    });
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  get id(): BitId {
    return this.toId();
  }

  toConsumer(repo: Repository, manipulateDirData: ManipulateDirItem[] | null | undefined): Promise<ConsumerComponent> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.component.toConsumerComponent(this.version, this.component.scope, repo, manipulateDirData);
  }

  async toObjects(
    repo: Repository,
    clientVersion: string | null | undefined,
    collectParents: boolean,
    collectArtifacts: boolean
  ): Promise<ObjectItem[]> {
    const version = await this.getVersion(repo);
    if (!version) throw new ShowDoctorError(`failed loading version ${this.version} of ${this.component.id()}`);
    // @todo: remove this customError once upgrading to v15, because when the server has v15
    // and the client has < 15, the client will get anyway an error to upgrade the version
    if (clientVersion && version.overrides && !R.isEmpty(version.overrides) && semver.lt(clientVersion, '14.1.0')) {
      throw new CustomError(`Your components were created with a newer version and use the "overrides" feature.
Please upgrade your bit client to version >= v14.1.0`);
    }
    const collectVersionObjects = async (ver: Version): Promise<ObjectItem[]> => {
      const versionRefs = ver.refsWithOptions(collectParents, collectArtifacts);
      const versionObjects = await ver.collectManyObjects(repo, versionRefs);
      const versionData = { ref: ver.hash(), buffer: await ver.asRaw(repo) };
      return [...versionObjects, versionData];
    };
    try {
      const componentData = { ref: this.component.hash(), buffer: await this.component.asRaw(repo) };
      const parentsObjects: ObjectItem[] = [];
      if (collectParents) {
        const allParentsHashes = await getAllVersionHashes(this.component, repo, true, version.hash());
        const missingParentsHashes = allParentsHashes.filter((h) => !h.isEqual(version.hash()));
        missingParentsHashes.map(async (parentHash) => {
          const parentVersion = (await parentHash.load(repo)) as Version;
          const parentsObj = await collectVersionObjects(parentVersion);
          parentsObjects.push(...parentsObj);
        });
      }
      const versionObjects = await collectVersionObjects(version);
      const scopeMeta = await repo.getScopeMetaObject();
      return [componentData, ...versionObjects, ...parentsObjects, scopeMeta];
    } catch (err) {
      logger.error(`component-version.toObjects ${this.id.toString()} got an error`, err);
      // @ts-ignore
      const originalVersionHash = this.component.getRef(this.version).toString();
      const currentVersionHash = version.hash().toString();
      if (originalVersionHash !== currentVersionHash) {
        throw new HashMismatch(this.component.id(), this.version, originalVersionHash, currentVersionHash);
      }
      throw err;
    }
  }
}
