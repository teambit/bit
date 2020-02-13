import InstallCmd from './install.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';

export type ServeConfig = {};

export type ServeDeps = [BitCli, Workspace];

export async function provideInstaller(config: ServeConfig, [cli, workspace]: ServeDeps) {
  // @ts-ignore
  cli.register(new InstallCmd(workspace));
}
