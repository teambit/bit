import InstallCmd from './install.cmd';
import { Workspace } from '@bit/bit.core.workspace';
import { BitCli } from '@bit/bit.core.cli';
import { PackageManager } from '@bit/bit.core.package-manager';
import { Install } from './install';
import { Reporter } from '@bit/bit.core.reporter';

export type InstallConfig = {};

export type InstallDeps = [BitCli, Workspace, PackageManager, Reporter];

export async function provideInstaller([cli, workspace, packageManager, reporter]: InstallDeps) {
  // @ts-ignore
  const install = new Install(workspace, packageManager, reporter);
  cli.register(new InstallCmd(install));
}
