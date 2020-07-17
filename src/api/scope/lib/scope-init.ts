import { Scope } from '../../../scope';

export default function init(path: string = process.cwd(), name: string, groupName: string): Promise<Scope> {
  return Scope.ensure(path, name, groupName).then((scope) => scope.ensureDir());
}
