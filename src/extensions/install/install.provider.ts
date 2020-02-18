import InstallCmd from './install.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { PackageManager } from '../package-manager';

export type ServeConfig = {};

export type ServeDeps = [BitCli, Workspace, PackageManager];

export async function provideInstaller(config: ServeConfig, [cli, workspace, packageManager]: ServeDeps) {
  // @ts-ignore
  cli.register(new InstallCmd(workspace, packageManager));
}
