import { loadScope, Scope } from '../../../scope';
import ModelComponent from '../../../scope/models/model-component';
import Symlink from '../../../scope/models/symlink';
import BitObject from '../../../scope/objects/object';

export default async function catScope(path: string, full: boolean): Promise<BitObject[]> {
  const scope: Scope = await loadScope(path);
  const bitObjects = await scope.objects.list();
  return full ? bitObjects : bitObjects.filter((obj) => obj instanceof ModelComponent || obj instanceof Symlink);
}
