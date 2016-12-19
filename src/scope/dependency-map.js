/** @flow */
import path from 'path';
import { BitId } from '../bit-id';
import { forEach, writeFile, readFile } from '../utils';
import Scope from './scope';
import { DEPENDENCY_MAP_FILENAME } from '../constants';

export function getPath(scopePath: string) {
  return path.join(scopePath, DEPENDENCY_MAP_FILENAME);
}

export default class DependencyMap extends Map<BitId, BitIds> {
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

  static load(json: {[string]: string}, scope: Scope): DependencyMap {
    const matrix = [];
    forEach(json, (val, key) => {
      matrix.push([BitId.parse(key), BitIds.deserialize()]);
    });

    return new DependencyMap(scope, matrix);
  }

  static loadFromFile(scopePath: string): Promise<DependencyMap> {
    return readFile(getPath(scopePath))
      .then(contents => DependencyMap.load(JSON.parse(contents.toString('utf8')), scope))
      .catch(() => new DependencyMap(scope));
  }
}
