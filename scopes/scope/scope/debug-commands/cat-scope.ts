import { loadScope, Scope } from '@teambit/legacy.scope';
import { BitObject, Lane, ModelComponent, ScopeMeta, Symlink, Version } from '@teambit/scope.objects';

export async function catScope(path: string, full?: boolean): Promise<BitObject[]> {
  const scope: Scope = await loadScope(path);
  return full
    ? scope.objects.list([ModelComponent, Symlink, Lane, Version, ScopeMeta])
    : scope.objects.list([ModelComponent, Symlink, Lane]);
}
