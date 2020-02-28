import { ContainerFactory, Container, Exec } from '@teambit/capsule';
import { AnyFS } from '@teambit/any-fs';
import { FsContainer, BitContainerConfig } from '../../capsule-ext';

export default class BitContainerFactory implements ContainerFactory<Exec, AnyFS> {
  createContainer(options?: BitContainerConfig): Promise<Container<Exec, AnyFS>> {
    return Promise.resolve(new FsContainer(options));
  }

  static create(): BitContainerFactory {
    return new BitContainerFactory();
  }

  obtain(config: any): Promise<Container<Exec, AnyFS>> {
    return Promise.resolve(new FsContainer(config));
  }
}
