/** @flow */
import path from 'path';
import { BitIds, BitId } from '../../bit-id';
import Bit from '../../bit';
import { DependencyMap } from './dependency-map';
import { SOURCES_MAP } from '../../constants';

export default class SourcesDependencyMap extends DependencyMap {
  getPath(): string {
    return path.join(this.repository.getPath(), SOURCES_MAP);
  }

  get(bitId: BitId): BitId[] {
    return super.get(bitId.toString(true));
  }

  setBit(id: BitId, bits: Bit[]) {
    super.set(id.toString(true), new BitIds(...bits.map(bit => bit.getId())));
    return this;
  }

  toObject() {
    const obj = {};
    this.forEach((bitIds, bitId) => {
      obj[bitId.toString(true)] = bitIds.map(dependency => dependency.toString());
    });
    return obj;
  }
}
