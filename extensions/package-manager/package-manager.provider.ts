import PackageManager from './package-manager';
import { Reporter } from '@bit/bit.core.reporter';

export type InstallDeps = [Reporter];

export async function providePackageManager([reporter]) {
  return new PackageManager('yarn', reporter);
}
