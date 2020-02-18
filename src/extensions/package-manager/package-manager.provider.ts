import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import PackageManager from './package-manager';

export type PMConfig = {
  packageManager: string;
};

export type PMDeps = [];

export async function providePackageManager(config: PMConfig, []: PMDeps) {
  return new PackageManager(config.packageManager);
}
