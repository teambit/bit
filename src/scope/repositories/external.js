/** @flow */
import path from 'path';
import { BIT_EXTERNAL_DIRNAME } from '../../constants';
import { BitId } from '../../bit-id';
import Repository from '../repository';
import Bit from '../../bit';
import { ExternalDependencyMap } from '../depdency-maps';

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

  getMany(bitIds: BitId[]): Promise<Bit[]> {
    return Promise.all(bitIds.map(id => this.get(id)))
      .then(values => values.reduce((result, value) => {
        value.success ? result.bits.push(value.bit) : result.missingIds.push(value.id); //eslint-disable-line
        return result;
      }, { bits: [], missingIds: [] }));
  }
}
