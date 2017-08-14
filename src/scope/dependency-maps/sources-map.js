/** @flow */
import path from 'path';
import { BitIds, BitId } from '../../bit-id';
import Bit from '../../consumer/component';
import { DependencyMap } from './dependency-map';
import { SOURCES_MAP } from '../../constants';

export default class SourcesDependencyMap extends DependencyMap {
  getPath(): string {
    return path.join(this.repository.getPath(), SOURCES_MAP);
  }

  get(bitId: BitId): BitId[] {
    return super.get(bitId.toStringWithoutScope());
  }

  setBit(id: BitId, bits: Bit[]) {
    super.set(id.toStringWithoutScope(), new BitIds(...bits.map(bit => bit.getId())));
    return this;
  }

  toObject() {
    const obj = {};
    this.forEach((bitIds, bitId) => {
      obj[bitId.toStringWithoutScope()] = bitIds.map(dependency => dependency.toString());
    });
    return obj;
  }
}
