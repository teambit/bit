import { loadScope, Scope } from '@teambit/legacy/dist/scope';
import { Lane, ModelComponent, ScopeMeta, Symlink, Version } from '@teambit/legacy/dist/scope/models';
import BitObject from '@teambit/legacy/dist/scope/objects/object';

export async function catScope(path: string, full?: boolean): Promise<BitObject[]> {
  const scope: Scope = await loadScope(path);
  return full
    ? scope.objects.list([ModelComponent, Symlink, Lane, Version, ScopeMeta])
    : scope.objects.list([ModelComponent, Symlink, Lane]);
}
