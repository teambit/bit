import { Capsule, ContainerFactory, Exec, Volume, State } from 'capsule';
import { EventEmitter } from 'events';
import { ResourceFactory, Resource } from './resource-pool';
import CapsuleResource from './capsule-resource';
import { BitContainerConfig } from '../capsule/container';

export default class CapsuleFactory<T extends Capsule<Exec, Volume>> extends EventEmitter
  implements ResourceFactory<T> {
  constructor(
    private bitContainerFactory: ContainerFactory<Exec, Volume>,
    private createFn: (
      containerFactory: ContainerFactory<Exec, Volume>,
      volume?: Volume,
      config?: any,
      initialState?: State,
      console?: Console
    ) => Promise<T>,
    private obtainFn: (containerFactory: ContainerFactory<Exec, Volume>, raw: string) => Promise<T>
  ) {
    super();
  }

  async create(config: BitContainerConfig): Promise<Resource<T>> {
    const capsule: T = await this.createFn(this.bitContainerFactory, new Volume(), config);
    await capsule.start();
    return new CapsuleResource(capsule, config);
  }

  async obtain(raw: string): Promise<Resource<T>> {
    const capsule: T = await this.obtainFn(this.bitContainerFactory, raw);
    return new CapsuleResource(capsule, {});
  }
}
