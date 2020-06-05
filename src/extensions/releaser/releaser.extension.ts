import { ExtensionManifest } from '@teambit/harmony';
import { BitCliExt, BitCli } from '../cli';
import { Environments } from '../environments';
import { WorkspaceExt, Workspace } from '../workspace';
import { Releaser } from './releaser';
import { ReleaserCmd } from './releaser.cmd';

export default {
  name: 'releaser',
  dependencies: [BitCliExt, Environments, WorkspaceExt],
  provider: provideReleaser
} as ExtensionManifest;

async function provideReleaser([cli, envs, workspace]: [BitCli, Environments, Workspace]) {
  const releaser = new Releaser(envs, workspace);
  cli.register(new ReleaserCmd(releaser, workspace));
  return releaser;
}
