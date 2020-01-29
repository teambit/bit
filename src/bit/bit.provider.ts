import { Workspace } from '../workspace';
import { Scope } from '../scope/scope.api';
import Capsule from '../capsule/capsule';
import Bit from './bit';
import { Harmony } from '../../extensions/harmony';

export type BitDeps = [Workspace, Scope, Capsule];

export type BitConfig = {};

export default async function provideBit(config: BitConfig, [workspace, scope, capsule]: BitDeps, harmony: Harmony) {
  const bit = new Bit(scope, workspace, capsule, harmony);
  await bit.loadExtensions();
  bit.onExtensionsLoaded.next();

  return bit;
}
