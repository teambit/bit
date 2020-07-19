import { loadScope } from '../../../scope';

export default function refreshScope(path: string): Promise<any> {
  return loadScope(path).then((scope) => {
    return scope.objects.list().then((objects) => Promise.all(objects.map((o) => scope.objects._writeOne(o))));
  });
}
