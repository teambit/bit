/** @flow */
import path from 'path';
import { BIT_EXTERNAL_DIRNAME } from '../../constants';
import Repository from '../repository';

export default class External extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_EXTERNAL_DIRNAME);
  }
}
