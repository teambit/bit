import type BitObject from './object';
import type Repository from './repository';

export default class Ref {
  hash: string;

  constructor(hash: string) {
    if (!hash) throw new Error('failed creating a Ref object, the hash argument is empty');
    this.hash = hash;
  }

  toString() {
    // reason for hash.toString() is when working with short hash, it's possible that all characters are numbers
    // so it's needed to convert it to string
    return this.hash.toString();
  }

  toShortString(numOfChars = 9) {
    return this.hash.substring(0, numOfChars).toString();
  }

  load(repository: Repository, throws = false): Promise<BitObject> {
    return repository.load(this, throws);
  }

  loadSync(repo: Repository, throws = true): BitObject {
    return repo.loadSync(this, throws);
  }

  loadRaw(repo: Repository): Promise<Buffer> {
    return repo.loadRaw(this);
  }

  isEqual(ref: Ref): boolean {
    return this.toString() === ref.toString();
  }

  clone() {
    return new Ref(this.hash);
  }

  static from(hash: string): Ref {
    return new Ref(hash);
  }
}
