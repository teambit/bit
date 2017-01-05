/** @flow */
import path from 'path';
import { BitId, BitIds } from '../bit-id';
import { forEach, writeFile } from '../utils';
import Scope from './scope';
import Bit from '../bit'; 
import { SOURCES_MAP } from '../constants';

export function getPath(scopePath: string) {
  return path.join(scopePath, SOURCES_MAP);
}

export class SourcesMap extends Map<string, BitIds> {
  scope: Scope;

  constructor(scope: Scope, dependencyTuples: [BitId, BitIds][] = []) {
    super(dependencyTuples);
    this.scope = scope;
  }

  get(bitId: BitId): BitIds {
    return super.get(bitId.toString(true));
  }

  delete(bitId: BitId): SourcesMap {
    super.delete(bitId.toString(true));
    return this;
  }

  getBitIds(dependencies: BitId[]) {
    return new BitIds(...dependencies);
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

  getPath(): string {
    return path.join(this.scope.getPath(), SOURCES_MAP);
  }

  write() {
    return writeFile(this.getPath(), JSON.stringify(this.toObject()));
  }

  static load(json: {[string]: string[]}, scope: Scope): SourcesMap {
    const matrix = [];
    forEach(json, (val, key) => {
      matrix.push([key, val.map(bitDep => BitId.parse(bitDep))]);
    });
    
    return new SourcesMap(scope, matrix);
  }
}
