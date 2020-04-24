import { Workspace } from '@bit/bit.core.workspace';
import { Scope } from 'bit-bin/scope';
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
