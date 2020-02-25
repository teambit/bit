import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import PackageManager from './package-manager';

export type PMConfig = {
  packageManager: 'librarian' | 'npm' | 'yarn';
  packageManagerArgs?: string[];
  packageManagerProcessOptions?: Record<string, any>;
};

export async function providePackageManager(config: PMConfig) {
  return new PackageManager(config.packageManager);
}
