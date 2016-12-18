/** @flow */
import * as path from 'path';
import Repository from '../repository';
import { BIT_SOURCES_DIRNAME } from '../../constants';
import Bit from '../../bit';
import ParitalBit from '../../bit/partial-bit';
import BitId from '../../bit-id';

export default class Source extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_SOURCES_DIRNAME);
  }

  getBitPath(bitName: string) {
    return path.join(this.getPath(), bitName);
  }  

  getPartial(name: string): Promise<ParitalBit> {
    return ParitalBit.load(name, path.join(this.getPath(), name));
  }
}
