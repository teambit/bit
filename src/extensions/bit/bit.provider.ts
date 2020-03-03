import { Harmony } from '@teambit/harmony';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import Network from '../network/network';
import Bit from './bit';

export type BitDeps = [Workspace, Scope, Network];

export type BitConfig = {};

export default async function provideBit(config: BitConfig, [workspace, scope, capsule]: BitDeps, harmony: Harmony) {
  const bit = new Bit(scope, workspace, capsule, harmony);
  await bit.loadExtensions();
  bit.onExtensionsLoaded.next();

  return bit;
}
