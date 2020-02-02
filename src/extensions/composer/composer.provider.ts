import { Watch } from '../watch';
import { Paper } from '../paper';
import Serve from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { Capsule } from '../../capsule';
import { Build } from '../build';

export type ServeConfig = {};

export type ServeDeps = [Watch, Paper, Workspace, Build];

export async function provideComposer(config: ServeConfig, [watch, paper, workspace, build]: ServeDeps) {
  paper.register(new ComposeCmd(workspace, build));
  return new Serve(watch);
}
