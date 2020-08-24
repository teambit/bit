import BitObject from './object';
import Repository from './repository';

export default class Ref {
  hash: string;

  constructor(hash: string) {
    if (!hash) throw new Error('failed creating a Ref object, the hash argument is empty');
    this.hash = hash;
  }

  toString() {
    return this.hash;
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
