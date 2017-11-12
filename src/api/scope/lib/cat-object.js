/** @flow */
import { loadScope } from '../../../scope';

export default function catObject(hash: string, pretty: boolean) {
  return loadScope().then((scope) => {
    return scope.getRawObject(hash).then((object) => {
      if (!object) return 'object not found';
      return object.getString(pretty);
    });
  });
}
