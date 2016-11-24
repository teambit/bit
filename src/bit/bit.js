/** @flow */
import BitFs from './bit-fs';
import { Repository } from '../repository';

export default class Bit {
  name: string;
  version: string; 
  dependencies: Bit[];
  repository: string;

  static create(repo: Repository) {
    BitFs.bitExists();
  }

  static edit() {
    
  }
}
