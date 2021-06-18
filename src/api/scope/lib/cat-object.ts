import { loadScope } from '../../../scope';

export default async function catObject(hash: string, pretty: boolean, stringify: boolean, headers: boolean) {
  const scope = await loadScope();
  const object = await scope.getRawObject(hash);
  if (headers) {
    return object.headers;
  }
  if (!object) return 'object not found';
  if (stringify) return JSON.stringify(object.content.toString());
  return object.getString(pretty);
}
