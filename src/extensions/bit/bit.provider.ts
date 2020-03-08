import { Harmony } from '@teambit/harmony';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import Isolator from '../isolator/isolator';
import Bit from './bit';

export type BitDeps = [Workspace, Scope, Isolator];

export type BitConfig = {};

export default async function provideBit([workspace, scope, capsule]: BitDeps, harmony: Harmony) {
  const bit = new Bit(scope, workspace, capsule, harmony);
  await bit.loadExtensions();
  bit.onExtensionsLoaded.next();

  return bit;
}
