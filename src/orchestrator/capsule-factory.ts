import { Capsule, ContainerFactory, Exec, State } from '@teambit/capsule';
import { FS as AnyFS, Volume } from '@teambit/any-fs';
import { EventEmitter } from 'events';
import { ResourceFactory, Resource } from './resource-pool';
import CapsuleResource from './capsule-resource';
import { BitContainerConfig } from '../capsule-ext/container';

export default class CapsuleFactory<T extends Capsule<Exec, AnyFS>> extends EventEmitter implements ResourceFactory<T> {
  constructor(
    private bitContainerFactory: ContainerFactory<Exec, AnyFS>,
    private createFn: (
      containerFactory: ContainerFactory<Exec, AnyFS>,
      volume?: AnyFS,
      config?: any,
      initialState?: State,
      console?: Console
    ) => Promise<T>,
    private obtainFn: (containerFactory: ContainerFactory<Exec, AnyFS>, raw: string) => Promise<T>
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
