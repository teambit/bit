import { Watch } from '@bit/bit.core.watch';
import Composer from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '@bit/bit.core.workspace';
import { BitCli } from '@bit/bit.core.cli';
import { Flows } from '@bit/bit.core.flows';

export type ComposerDeps = [Watch, BitCli, Workspace, Flows];

export async function provideComposer([watch, cli, workspace, flows]: ComposerDeps) {
  // @ts-ignore
  cli.register(new ComposeCmd(workspace, flows));
  return new Composer(watch);
}
