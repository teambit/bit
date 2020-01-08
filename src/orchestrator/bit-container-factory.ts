import { ContainerFactory, Container, Exec, Volume } from 'capsule';
import FsContainer, { BitContainerConfig } from '../capsule-ext/container';

export default class BitContainerFactory implements ContainerFactory<Exec, Volume> {
  createContainer(options?: BitContainerConfig): Promise<Container<Exec, Volume>> {
    return Promise.resolve(new FsContainer(options));
  }

  static create(): BitContainerFactory {
    return new BitContainerFactory();
  }

  obtain(config: any): Promise<Container<Exec, Volume>> {
    return Promise.resolve(new FsContainer(config));
  }
}
