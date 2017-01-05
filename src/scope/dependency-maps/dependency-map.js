/** @flow */
import path from 'path';
import { BitId, BitIds } from '../../bit-id';
import Repository from '../repository';
import { forEach, writeFile } from '../../utils';
import Scope from '../scope';
import Bit from '../../bit';
import { DEPENDENCY_MAP_FILENAME } from '../../constants';

export function getPath(repositoryPath: string) {
  return path.join(repositoryPath, DEPENDENCY_MAP_FILENAME);
}

export class DependencyMap extends Map<string, BitIds> {
  repository: Repository;

  constructor(repository: Repository, dependencyTuples: [BitId, BitIds][] = []) {
    super(dependencyTuples);
    this.repository = repository;
  }

  get(bitId: BitId): BitIds {
    return super.get(bitId.toString());
  }

  getBitIds(dependencies: BitId[]) {
    return new BitIds(...dependencies);
  }

  toObject() {
    const obj = {};
    this.forEach((bitIds, bitId) => {
      obj[bitId.toString()] = bitIds.map(dependency => dependency.toString());
    });
    return obj;
  }

  getPath(): string {
    return path.join(this.repository.getPath(), DEPENDENCY_MAP_FILENAME);
  }

  write() {
    return writeFile(this.getPath(), JSON.stringify(this.toObject()));
  }

  setBit(id: BitId, bits: Bit[]) {
    super.set(id.toString(), new BitIds(...bits.map(bit => bit.getId())));
    return this;
  }

  static load(json: {[string]: string[]}, repository: Repository): DependencyMap {
    const matrix = [];
    forEach(json, (val, key) => {
      matrix.push([key, val.map(bitDep => BitId.parse(bitDep.id))]);
    });
    
    return new DependencyMap(repository, matrix);
  }
}
