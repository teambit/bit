/** @flow */
import { loadScope } from '../../scope';
import { ScopeNotFound } from '../../scope/exceptions';

export default function describeScope(path: string) {
  return loadScope(path).then((scope) => {
    return scope.describe();
  })
  .catch(() => {
    return {};
  });  
}
