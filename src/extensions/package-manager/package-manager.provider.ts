import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import PackageManager from './package-manager';

const DEFAULT_PACKAGE_MANAGER = 'librarian';

export type ServeConfig = {};

export type ServeDeps = [BitCli, Workspace];

export async function providePackageManager(config: ServeConfig, [cli, workspace]: ServeDeps) {
  return new PackageManager(DEFAULT_PACKAGE_MANAGER);
}
