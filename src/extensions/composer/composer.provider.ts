import { Watch } from '../watch';
import Composer from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { Build } from '../build';

export type ServeConfig = {};

export type ServeDeps = [Watch, BitCli, Workspace, Build];

export async function provideComposer(config: ServeConfig, [watch, cli, workspace, build]: ServeDeps) {
  // @ts-ignore
  cli.register(new ComposeCmd(workspace, build));
  return new Composer(watch);
}
