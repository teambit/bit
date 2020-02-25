import InstallCmd from './install.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { PackageManager } from '../package-manager';
import { Install } from './install';

export type InstallConfig = {};

export type InstallDeps = [BitCli, Workspace, PackageManager];

export async function provideInstaller(config: InstallConfig, [cli, workspace, packageManager]: InstallDeps) {
  // @ts-ignore
  const install = new Install(workspace, packageManager);
  cli.register(new InstallCmd(install));
}
