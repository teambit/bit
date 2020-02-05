import { Watch } from '../watch';
import Composer from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { Pipes } from '../pipes';

export type ServeConfig = {};

export type ServeDeps = [Watch, BitCli, Workspace, Pipes];

export async function provideComposer(config: ServeConfig, [watch, cli, workspace, pipes]: ServeDeps) {
  // @ts-ignore
  cli.register(new ComposeCmd(workspace, pipes));
  return new Composer(watch);
}
