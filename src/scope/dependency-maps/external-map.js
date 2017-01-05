/** @flow */
import path from 'path';
import { DependencyMap } from './dependency-map';
import { EXTERNAL_MAP } from '../../constants';

export default class ExternalDependencyMap extends DependencyMap {
  getPath(): string {
    return path.join(this.repository.getPath(), EXTERNAL_MAP);
  }
}
