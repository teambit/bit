import { ContainerFactoryOptions } from '@teambit/capsule';
import BitId from '../../../../bit-id/bit-id';

export interface CapsuleOptions extends ContainerFactoryOptions {
  bitId?: BitId;
  baseDir?: string;
  writeDists?: boolean;
  writeSrcs?: boolean;
  writeBitDependencies?: boolean;
  installPackages?: boolean;
  packageManager?: SuppoertedPackageMannagers;
}

export type SuppoertedPackageMannagers = 'npm' | 'librarian' | 'yarn' | 'pnpm';
