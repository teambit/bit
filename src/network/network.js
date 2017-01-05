/** @flow */
import { BitIds } from '../bit-id';
import Bit from '../bit';
import { BitDependencies } from '../scope';
import type { ScopeDescriptor } from '../scope/scope';

export interface Network {
  connect(host: string): Network;
  close(): void;
  get(commandName: string): Promise<any>;
  describeScope(): Promise<ScopeDescriptor>;
  fetch(bitIds: BitIds): Promise<BitDependencies[]>;
  fetchOnes(bitIds: BitIds): Promise<Bit[]>;
}
