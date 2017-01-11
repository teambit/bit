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

  load(repository: Repository) {
    return repository.findOne(this);
  }

  loadSync(repo: Repository): BitObject {
    return repo.loadSync(this);
  }

  loadRaw(repo: Repository): Promise<Buffer> {
    return repo.loadRaw(this);
  }

  static from(hash: string) {
    return new Ref(hash);
  }
}
