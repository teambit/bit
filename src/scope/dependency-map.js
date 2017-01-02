/** @flow */
import path from 'path';
import { Remotes } from '../remotes';
import { BitId, BitIds } from '../bit-id';
import { forEach, writeFile } from '../utils';
import Scope from './scope';
import Bit from '../bit';
import { DEPENDENCY_MAP_FILENAME } from '../constants';

export function getPath(scopePath: string) {
  return path.join(scopePath, DEPENDENCY_MAP_FILENAME);
}

export type BitDependency = {
  id: BitId,
  remote: BasicRemote
};

export type BasicRemote = {
  alias: string,
  host: string
};

export class DependencyMap extends Map<BitId, BitDependency[]> {
  scope: Scope;

  constructor(scope: Scope, dependencyTuples: [BitId, BitDependency[]][] = []) {
    super(dependencyTuples);
    this.scope = scope;
  }

  get(bitId: BitId): BitDependency[] {
    return super.get(bitId.toString());
  }

  getBitIds(dependencies: BitDependency[]) {
    return new BitIds(...dependencies.map(bitDep => bitDep.id));
  }

  getRemotes(dependencies: BitDependency[]) {
    const obj = {};
    dependencies.forEach((bitDep) => {
      obj[bitDep.remote.alias] = bitDep.remote.host;
    });
    return Remotes.load(obj);
  }

  toObject() {
    const obj = {};
    this.forEach((bitIds, bitId) => {
      obj[bitId.toString()] = bitIds.map((dependency) => {
        return {
          id: dependency.id.toString(),
          remote: dependency.remote
        };
      });
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
    super.set(bitId.getId(), new BitIds(...bits.map((bit) => {
      const id = bit.getId();
      const remote = id.getRemote(this.scope, bit.remotes());
      return {
        id,
        remote: remote.toPlainObject()
      };
    })));
    return this;
  }

  static load(json: {[string]: {id: string, remote: BasicRemote}[]}, scope: Scope): DependencyMap {
    const matrix = [];
    forEach(json, (val, key) => {
      matrix.push([key, val.map((bitDep) => {
        return {
          id: BitId.parse(bitDep.id),
          remote: bitDep.remote
        };
      })]);
    });
    
    return new DependencyMap(scope, matrix);
  }
}
