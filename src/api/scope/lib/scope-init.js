/** @flow */
import { Scope } from '../../../scope';

export default function init(path: string, name: string, groupName: string): Promise<Scope> {
  return Scope.ensure(path, name, groupName).then(scope => scope.ensureDir());
}
