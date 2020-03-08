import { Workspace } from '../../extensions/workspace';
import { Scope } from '../../scope';
import Isolator from '../isolator/isolator';
import Bit from './bit';

export type BitDeps = [Workspace, Scope, Isolator];

export type BitConfig = {};

export default async function provideBit(_config: BitConfig, [workspace, scope]: BitDeps) {
  const bit = new Bit(scope, workspace);
  return bit;
}
