/** @flow */
import Repository from './repository';

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

  static from(hash: string) {
    return new Ref(hash);
  }
}
