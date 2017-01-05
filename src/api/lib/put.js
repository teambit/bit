import { loadScope } from '../../scope';
import Bit from '../../bit';

export default function put({ tar, path }: { name: string, tar: Buffer }): Promise<any> {
  return loadScope(path).then((scope) => {
    return Bit.fromTar({ tarball: tar, scope: scope.name() })
      .then(bit => scope.put(bit));
  });
}
