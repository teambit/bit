import { Watch } from '../watch';
import { Paper } from '../paper';
import Serve from './composer';
import ComposeCmd from './compose.cmd';
import { Workspace } from '../workspace';
import { Capsule } from '../../capsule';

export type ServeConfig = {};

export type ServeDeps = [Watch, Paper, Workspace, Capsule];

export async function provideComposer(config: ServeConfig, [watch, paper, workspace, capsule]: ServeDeps) {
  paper.register(new ComposeCmd(workspace, capsule));
  return new Serve(watch);
}
