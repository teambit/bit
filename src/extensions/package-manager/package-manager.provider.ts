import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import PackageManager from './package-manager';

export type PMConfig = {
  packageManager: string;
};

export type PMDeps = [BitCli, Workspace];

export async function providePackageManager(config: PMConfig, [cli, workspace]: PMDeps) {
  return new PackageManager(config.packageManager);
}
