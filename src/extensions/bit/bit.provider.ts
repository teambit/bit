import { Harmony } from '@teambit/harmony';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import Isolator from '../isolator/isolator';
import Reporter from '../reporter/reporter';
import Bit from './bit';

export type BitDeps = [Workspace, Scope, Isolator, Reporter];

export type BitConfig = {};

export default async function provideBit([workspace, scope, isolator, reporter]: BitDeps, harmony: Harmony) {
  const bit = new Bit(scope, workspace, isolator, reporter, harmony);
  await bit.loadExtensions();
  bit.onExtensionsLoaded.next();

  return bit;
}
