/** @flow */
import { loadScope } from '../../../scope';

export default function catObject(hash: string, pretty: boolean) {
  return loadScope().then((scope) => {
    return scope.getObject(hash).then((object) => {
      if (!object) return 'object not found';
      return object.toBuffer(pretty);
    });
  });
}
