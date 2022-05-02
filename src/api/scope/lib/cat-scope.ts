import { loadScope, Scope } from '../../../scope';
import { Lane, ModelComponent, ScopeMeta, Symlink, Version } from '../../../scope/models';
import BitObject from '../../../scope/objects/object';

export default async function catScope(path: string, full: boolean): Promise<BitObject[]> {
  const scope: Scope = await loadScope(path);
  return full
    ? scope.objects.list([ModelComponent, Symlink, Lane, Version, ScopeMeta])
    : scope.objects.list([ModelComponent, Symlink, Lane]);
}
