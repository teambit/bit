import { ContainerFactoryOptions } from 'capsule/dist/capsule/container/container-factory';
import BitId from '../../bit-id/bit-id';

export interface CapsuleOptions extends ContainerFactoryOptions {
  bitId?: BitId;
  baseDir?: string;
  writeDists?: boolean;
  writeSrcs?: boolean;
  writeBitDependencies?: boolean;
  installPackages: boolean;
}
