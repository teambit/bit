import { loadScope } from '../../../scope';

export default function describeScope(path: string) {
  return loadScope(path).then((scope) => {
    return scope.describe();
  });
}
