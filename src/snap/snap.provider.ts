import Snap from './snap';
import { Scope } from '../scope/scope.api';
import { Workspace } from '../workspace';
import { Harmony } from '../harmony';

export type SnapDeps = [Workspace, Scope];

export type SnapConfig = {};

export default async function provideSnap(config: SnapConfig, [workspace, scope]: SnapDeps, harmony: Harmony) {
  const snap = new Snap(workspace, scope);
  return snap;
}
