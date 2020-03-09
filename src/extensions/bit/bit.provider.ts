import { Harmony } from '@teambit/harmony';
import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import Isolator from '../isolator/isolator';
import Bit from './bit';

export type BitDeps = [Workspace, Scope];

export type BitConfig = {};

export default async function provideBit([workspace, scope]: BitDeps, harmony: Harmony) {
  const bit = new Bit(scope, workspace);
  return bit;
}
