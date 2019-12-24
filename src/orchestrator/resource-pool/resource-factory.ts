import { EventEmitter } from 'events';
import Resource from './resource';
import { BitContainerConfig } from '../../capsule/container';

export default interface ResourceFactory<T> extends EventEmitter {
  create(config: BitContainerConfig): Promise<Resource<T>>;

  obtain(raw: string): Promise<Resource<T>>;
}
