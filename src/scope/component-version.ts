import { BitId, BitIds } from '../bit-id';
import ConsumerComponent from '../consumer/component';
import { ManipulateDirItem } from '../consumer/component-ops/manipulate-dir';
import ModelComponent from './models/model-component';
import Version from './models/version';
import { Ref } from './objects';
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
}

export type CollectObjectsOpts = {
  collectParents: boolean;
  collectParentsUntil?: Ref | null; // stop traversing when this hash found. helps to import only the delta.
  collectArtifacts: boolean;
};
