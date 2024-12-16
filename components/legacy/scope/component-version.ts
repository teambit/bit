import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { Repository, Version, ModelComponent } from '@teambit/scope.objects';

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

  toConsumer(repo: Repository): Promise<ConsumerComponent> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.component.toConsumerComponent(this.version, this.component.scope, repo);
  }
}
