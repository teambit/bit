import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import Bit from './bit';

export type BitDeps = [Workspace, Scope];

export type BitConfig = {};

export default async function provideBit([workspace, scope]: BitDeps) {
  const bit = new Bit(scope, workspace);
  if (workspace) {
    await workspace.loadWorkspaceExtensions();
  }
  return bit;
}
