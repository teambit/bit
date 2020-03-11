import PackageManager from './package-manager';
import Reporter from '../reporter';

export type InstallDeps = [Reporter];

export async function providePackageManager([reporter]) {
  return new PackageManager('yarn', reporter);
}
