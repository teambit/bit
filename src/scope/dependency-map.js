/** @flow */
import path from 'path';
import { BitId, BitIds } from '../bit-id';
import { forEach, writeFile } from '../utils';
import Scope from './scope';
import Bit from '../bit';
import { DEPENDENCY_MAP_FILENAME } from '../constants';

export function getPath(scopePath: string) {
  return path.join(scopePath, DEPENDENCY_MAP_FILENAME);
}

export class DependencyMap extends Map<BitId, BitIds> {
  scope: Scope;

  constructor(scope: Scope, dependencyTuples: [BitId, BitId[]][] = []) {
    super(dependencyTuples);
    this.scope = scope;
  }

  toObject() {
    const obj = {};
    this.forEach((bitIds, bitId) => {
      obj[bitId.toString()] = bitIds.serialize();
    });
    return obj;
  }

  getPath(): string {
    return path.join(this.scope.getPath(), DEPENDENCY_MAP_FILENAME);
  }

  write() {
    return writeFile(this.getPath(), JSON.stringify(this.toObject()));
  }

  setBit(bitId: Bit, bits: Bit[]) {
    super.set(bitId.getId(), new BitIds(...bits.map(bit => bit.getId())));
    return this;
  }

  static load(json: {[string]: string}, scope: Scope): DependencyMap {
    const matrix = [];
    forEach(json, (val, key) => {
      matrix.push([BitId.parse(key), BitIds.deserialize(val)]);
    });

    return new DependencyMap(scope, matrix);
  }
}
