import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import Bit from './bit';
import { Harmony } from '../harmony';
import { PipesExt } from '../pipes';

export type BitDeps = [Workspace, Scope];

export type BitConfig = {};

export default async function provideBit(config: BitConfig, [workspace, scope]: BitDeps, harmony: Harmony) {
  harmony.load([PipesExt]);
  return new Bit(scope, workspace);
}
