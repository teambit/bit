/** @flow */
import BitFs from '../bit-fs';
import { Repository } from '../repository';

export default class Bit {
  name: string;
  version: string; 
  dependencies: Bit[];
  repository: Repository;
  bitPath: string;

  constructor(name: string, bitPath: string, repo: Repository) {
    this.name = name;
    this.bitPath = bitPath;
    this.repository = repo;
  }

  static create(repo: Repository, bitName: string): Bit {
    const bitPath = BitFs.addBit(bitName, repo);
    return new Bit(bitName, bitPath, repo);
  }

  static edit() {
    
  }
}
