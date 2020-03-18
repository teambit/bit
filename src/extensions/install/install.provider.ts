import InstallCmd from './install.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { PackageManager } from '../package-manager';
import { Install } from './install';
import { Reporter } from '../reporter';

export type InstallConfig = {};

export type InstallDeps = [BitCli, Workspace, PackageManager, Reporter];

export async function provideInstaller([cli, workspace, packageManager, reporter]: InstallDeps) {
  // @ts-ignore
  const install = new Install(workspace, packageManager, reporter);
  cli.register(new InstallCmd(install));
}
