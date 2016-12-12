/** @flow */
import * as path from 'path';
import Repository from '../repository';
import { BIT_CACHE_DIRNAME } from '../../constants';

export default class Cache extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_CACHE_DIRNAME);
  }
}
