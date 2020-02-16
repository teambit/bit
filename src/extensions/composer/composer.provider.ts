import { Watch } from '../watch';
import Composer from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { BitCli } from '../cli';
import { Scripts } from '../scripts';

export type ServeConfig = {};

export type ServeDeps = [Watch, BitCli, Workspace, Scripts];

export async function provideComposer(config: ServeConfig, [watch, cli, workspace, scripts]: ServeDeps) {
  // @ts-ignore
  cli.register(new ComposeCmd(workspace, scripts));
  return new Composer(watch);
}
