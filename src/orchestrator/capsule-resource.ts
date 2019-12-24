import { Capsule, Exec, Volume } from 'capsule';
import { Resource } from './resource-pool';
import { ResourceEvents } from './resource-pool/resource';

export default class CapsuleResource<T extends Capsule<Exec, Volume>> extends Resource<T> {
  get id(): string {
    return this.resource.containerId;
  }

  serialize(): string {
    return this.resource.serialize();
  }

  destroy(): Promise<void> {
    super.destroy();
    this.emit(ResourceEvents.Destroyed);
    return this.resource.destroy();
  }
}
