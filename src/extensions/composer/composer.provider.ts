import { Watch } from '../watch';
import Composer from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { Flows } from '../flows';

export type ComposerConfig = {};

export type ComposerDeps = [Watch, BitCli, Workspace, Flows];

export async function provideComposer(config: ComposerConfig, [watch, cli, workspace, flows]: ComposerDeps) {
  // @ts-ignore
  cli.register(new ComposeCmd(workspace, flows));
  return new Composer(watch);
}
