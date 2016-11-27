/** @flow */
import BitFs from '../bit-fs';
import { Repository } from '../repository';

export default class Bit {
  name: string;
  version: string; 
  dependencies: Bit[];
  repository: Repository;
  path: string;
  env: string;
  sig: string;
  examples: string;

  constructor({ name, version, env, path, repo, sig, examples, dependencies }: any) {
    this.name = name;
    this.version = version;
    this.env = env;
    this.dependencies = dependencies;
    this.path = path;
    this.repository = repo;
    this.sig = sig;
    this.examples = examples;
  }

  remove(name: string) {
    const result = BitFs.removeBit();
    return result;
  }

  static load(name: string, repo: Repository): ?Bit {
    const rawBit = BitFs.loadBit(name, repo);
    if (!rawBit) return null;
    return new Bit(rawBit);
  }

  static create(repo: Repository, bitName: string): Bit {
    const path = BitFs.addBit(bitName, repo);
    return new Bit({
      name: bitName,
      repo,
      path
    });
  }

  static edit() {
    
  }
}
