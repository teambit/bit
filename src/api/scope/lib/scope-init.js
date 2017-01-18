/** @flow */
import { Scope } from '../../../scope';

export default function init(path: string, name: string): Promise<Scope> {
  return Scope.create(path, name).then(scope => scope.ensureDir());
}
