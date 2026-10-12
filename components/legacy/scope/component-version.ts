import type { ComponentIdList } from '@teambit/component-id';
import { ComponentID } from '@teambit/component-id';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { Repository, Version, ModelComponent } from '@teambit/objects';
import { registerRustSnapshotTransactionClass, hasRustSnapshotTransactionClassFields } from '@teambit/objects';
import type { SourceFile } from '@teambit/component.sources';

export class ComponentVersion {
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

  async flattenedDependencies(repository: Repository): Promise<ComponentIdList> {
    return this.getVersion(repository).then((version) => version.flattenedDependencies);
  }

  toComponentId(): ComponentID {
    return ComponentID.fromObject({
      scope: this.component.scope,
      name: this.component.name,
      version: this.version,
    });
  }

  get id(): ComponentID {
    return this.toComponentId();
  }

  toConsumer(
    repo: Repository,
    sourceFiles?: (version: Version) => SourceFile[] | undefined
  ): Promise<ConsumerComponent> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return sourceFiles && hasRustSnapshotTransactionClassFields(this.component, 'ModelComponent', [])
      ? this.component.toConsumerComponent(this.version, this.component.scope, repo, sourceFiles)
      : this.component.toConsumerComponent(this.version, this.component.scope, repo);
  }
}
registerRustSnapshotTransactionClass('CheckoutComponentVersion', ComponentVersion);
