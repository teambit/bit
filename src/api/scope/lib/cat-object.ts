import { loadScope } from '../../../scope';

export default function catObject(hash: string, pretty: boolean, stringify: boolean) {
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return loadScope().then((scope) => {
    return scope.getRawObject(hash).then((object) => {
      if (!object) return 'object not found';
      if (stringify) return JSON.stringify(object.content.toString());
      return object.getString(pretty);
    });
  });
}
