import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import Bit from './bit';

export type BitDeps = [Workspace, Scope];

export type BitConfig = {};

export default async function provideBit(config: BitConfig, [workspace, scope]: BitDeps) {
  return new Bit(scope, workspace);
}
