import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import Capsule from '../environment/capsule-builder';
import Bit from './bit';
import { Harmony } from '../harmony';

export type BitDeps = [Workspace, Scope, Capsule];

export type BitConfig = {};

export default async function provideBit(config: BitConfig, [workspace, scope, capsule]: BitDeps, harmony: Harmony) {
  const bit = new Bit(scope, workspace);
  const exts = await bit.loadExtensions(capsule);
  harmony.load(exts);
  return bit;
}
