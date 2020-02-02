import { Watch } from '../watch';
import Serve from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { Capsule } from '../../capsule';
import { BitCli } from '../cli';

export type ServeConfig = {};

export type ServeDeps = [Watch, BitCli, Workspace, Capsule];

export async function provideComposer(config: ServeConfig, [watch, cli, workspace, capsule]: ServeDeps) {
  cli.register(new ComposeCmd(workspace, capsule));
  return new Serve(watch);
}
