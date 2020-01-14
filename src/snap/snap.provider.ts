import Snap from './snap';
import { Scope } from '../scope/scope.api';
import { Workspace } from '../workspace';
import { Paper } from '../paper';
import { Harmony } from '../harmony';
import { SnapCommand } from './snap-command';

export type SnapDeps = [Paper, Workspace, Scope];

export type SnapConfig = {};

export default async function provideSnap(config: SnapConfig, [paper, workspace, scope]: SnapDeps, harmony: Harmony) {
  const snap = new Snap(workspace, scope);
  paper.register(new SnapCommand(snap));
  return snap;
}
