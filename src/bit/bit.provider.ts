import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import Capsule from '../environment/capsule-builder';
import Bit from './bit';
import bitExtension from './bit.extension';
import { Harmony } from '../harmony';
import { PipesExt } from '../pipes';

export type BitDeps = [Workspace, Scope, Capsule];

export type BitConfig = {};

export default async function provideBit(config: BitConfig, [workspace, scope, Capsule]: BitDeps, harmony: Harmony) {
  harmony.load([PipesExt]);
  const bit = new Bit(scope, workspace);
  await bit.loadExtensions(Capsule);
  return bit;
}
