import { loadScope } from '../../scope';
import Bit from '../../bit';

export default function put({ tar, path }: { name: string, tar: Buffer }): Promise<any> {
  return loadScope(path).then((scope) => {
    return scope.put({ tarball: Bit.fromTar(tar), scope: scope.name() });
  });
}
