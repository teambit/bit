import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import PackageManager from './package-manager';

export type PMConfig = {
  packageManager: string;
};

export async function providePackageManager(config: PMConfig) {
  return new PackageManager(config.packageManager);
}
