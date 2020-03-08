import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import Isolator from '../isolator/isolator';
import Bit from './bit';
import { Harmony } from '../../harmony';

export type BitDeps = [Workspace, Scope, Isolator];

export type BitConfig = {};

export default async function provideBit(
  config: BitConfig,
  [workspace, scope, capsule]: BitDeps,
  harmony: Harmony<unknown>
) {
  const bit = new Bit(scope, workspace, capsule, harmony);
  await bit.loadExtensions();
  bit.onExtensionsLoaded.next();

  return bit;
}
