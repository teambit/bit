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
import { Ref } from './objects';
import { ObjectItem } from './objects/object-list';
import Repository from './objects/repository';

export default class ComponentVersion implements ObjectCollector {
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

  getVersion(repository: Repository, throws = true): Promise<Version> {
    return this.component.loadVersion(this.version, repository, throws);
  }

  flattenedDependencies(repository: Repository): Promise<BitIds> {
    return this.getVersion(repository).then((version) => version.flattenedDependencies);
  }

  toId(): BitId {
    return new BitId({
      scope: this.component.scope,
      name: this.component.name,
      version: this.version,
    });
  }

  get id(): BitId {
    return this.toId();
  }

  toConsumer(repo: Repository, manipulateDirData: ManipulateDirItem[] | null | undefined): Promise<ConsumerComponent> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.component.toConsumerComponent(this.version, this.component.scope, repo, manipulateDirData);
  }

  async collectObjects(
    repo: Repository,
    clientVersion: string | null | undefined,
    options: CollectObjectsOpts
  ): Promise<ObjectItem[]> {
    const { collectParents, collectArtifacts, collectParentsUntil } = options;
    const version = await this.getVersion(repo, false);
    if (!version) throw new ShowDoctorError(`failed loading version ${this.version} of ${this.component.id()}`);
    // @todo: remove this customError once upgrading to v15, because when the server has v15
    // and the client has < 15, the client will get anyway an error to upgrade the version
    if (clientVersion && version.overrides && !R.isEmpty(version.overrides) && semver.lt(clientVersion, '14.1.0')) {
      throw new CustomError(`Your components were created with a newer version and use the "overrides" feature.
Please upgrade your bit client to version >= v14.1.0`);
    }
    if (collectParentsUntil && version.hash().isEqual(collectParentsUntil)) {
      return [];
    }
    const collectVersionObjects = async (ver: Version): Promise<ObjectItem[]> => {
      const versionRefs = ver.refsWithOptions(collectParents, collectArtifacts);
      const versionObjects = await ver.collectManyObjects(repo, versionRefs);
      const versionData = { ref: ver.hash(), buffer: await ver.asRaw(repo), type: ver.getType() };
      return [...versionObjects, versionData];
    };
    try {
      const componentData = {
        ref: this.component.hash(),
        buffer: await this.component.asRaw(repo),
        type: this.component.getType(),
      };
      const parentsObjects: ObjectItem[] = [];
      if (collectParents) {
        const allParentsHashes = await getAllVersionHashes(
          this.component,
          repo,
          true,
          version.hash(),
          collectParentsUntil
        );
        const missingParentsHashes = allParentsHashes.filter((h) => !h.isEqual(version.hash()));
        await Promise.all(
          missingParentsHashes.map(async (parentHash) => {
            const parentVersion = (await parentHash.load(repo)) as Version;
            const parentsObj = await collectVersionObjects(parentVersion);
            parentsObjects.push(...parentsObj);
          })
        );
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

export interface ObjectCollector {
  collectObjects(
    repo: Repository,
    clientVersion: string | null | undefined,
    options: CollectObjectsOpts
  ): Promise<ObjectItem[]>;
}

export type CollectObjectsOpts = {
  collectParents: boolean;
  collectParentsUntil?: Ref | null; // stop traversing when this hash found. helps to import only the delta.
  collectArtifacts: boolean;
};
