/** @flow */
import * as path from 'path';
import Repository from '../repository';
import { BIT_SOURCES_DIRNAME } from '../../constants';

export default class Source extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_SOURCES_DIRNAME);
  }

  getBitPath(bitName: string) {
    return path.join(this.getPath(), bitName);
  }  
}
