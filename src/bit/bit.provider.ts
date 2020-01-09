import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import Capsule from '../environment/capsule-builder';
import Bit from './bit';
import bitExtension from './bit.extension';

export type BitDeps = [Workspace, Scope, Capsule];

export type BitConfig = {};

export default async function provideBit(config: BitConfig, [workspace, scope, Capsule]: BitDeps) {
  const bit = new Bit(scope, workspace);
  await bit.loadExtensions(Capsule);
  return bit;
}
