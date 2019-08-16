/** @flow */
import Repository from './repository';
import BitObject from './object';

export default class Ref {
  hash: string;

  constructor(hash: string) {
    if (!hash) throw new Error('failed creating a Ref object, the hash argument is empty');
    this.hash = hash;
  }

  toString() {
    return this.hash;
  }

  load(repository: Repository, throws: boolean = false): Promise<BitObject> {
    return repository.load(this, throws);
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
