/** @flow */
import { Scope } from '../../scope';

export default function init(path: string): Promise<Scope> {
  return Scope.create(path).ensureDir();
}
