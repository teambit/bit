/** @flow */
import path from 'path';
import { BIT_EXTERNAL_DIRNAME } from '../../constants';
import { BitId } from '../../bit-id';
import Repository from '../repository';
import Scope from '../scope';
import Bit from '../../bit';
import { ExternalDependencyMap } from '../dependency-maps';

export default class External extends Repository {
  externalMap: ExternalDependencyMap;

  constructor(scope: Scope, externalMap: ExternalDependencyMap) {
    super(scope);
    this.externalMap = externalMap;
  }

  getPath(): string {
    return path.join(super.getPath(), BIT_EXTERNAL_DIRNAME);
  }

  composePath(bitId: BitId) {
    return path.join(bitId.scope, bitId.box, bitId.name, bitId.version);
  }

  store(bit: Bit) {
    return bit
      .cd(this.composePath(bit.getId()))
      .write(true)
      .then(() => this.externalMap.setBit(bit))
      .then(() => bit);
  }

  storeMany(bits: Bit[]) {
    return Promise.all(bits.map(bit => bit.store()));
  }

  get(id: BitId): Promise<?Bit> {
    return Bit.load(this.composePath(id), id.name)
      .then((bit) => {
        return { bit, success: true };
      })
      .catch(() => {
        return { id, success: false };
      });
  }

  write() {
    return this.externalMap.write();
  }
}
