/** @flow */
import * as path from 'path';
import Repository from '../repository';
import { BIT_TMP_DIRNAME } from '../../constants';

export default class Tmp extends Repository {
  getPath(): string {
    return path.join(super.getPath(), BIT_TMP_DIRNAME);
  }
}
