import { ContainerFactory, Container, Exec } from '@teambit/capsule';
import { FS as Anyfs } from '@teambit/any-fs';
import FsContainer, { BitContainerConfig } from '../capsule-ext/container';

export default class BitContainerFactory implements ContainerFactory<Exec, Anyfs> {
  createContainer(options?: BitContainerConfig): Promise<Container<Exec, Anyfs>> {
    return Promise.resolve(new FsContainer(options));
  }

  static create(): BitContainerFactory {
    return new BitContainerFactory();
  }

  obtain(config: any): Promise<Container<Exec, Anyfs>> {
    return Promise.resolve(new FsContainer(config));
  }
}
