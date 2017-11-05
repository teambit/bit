/** @flow */
import Repository from './repository';
import BitObject from './object';

export default class Ref {
  hash: string;

  constructor(hash: string) {
    this.hash = hash;
  }

  toString() {
    return this.hash;
  }

  load(repository: Repository): Promise<BitObject> {
    return repository.findOne(this);
  }

  loadSync(repo: Repository, throws: boolean = true): BitObject {
    return repo.loadSync(this, throws);
  }

  loadRaw(repo: Repository): Promise<Buffer> {
    return repo.loadRaw(this);
  }

  static from(hash: string): Ref {
    return new Ref(hash);
  }
}
