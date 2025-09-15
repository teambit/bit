import type { Scope } from '@teambit/legacy.scope';
import { loadScope } from '@teambit/legacy.scope';
import type { BitObject } from '@teambit/objects';
import { Lane, ModelComponent, ScopeMeta, Symlink, Version } from '@teambit/objects';

export async function catScope(path: string, full?: boolean): Promise<BitObject[]> {
  const scope: Scope = await loadScope(path);
  return full
    ? scope.objects.list([ModelComponent, Symlink, Lane, Version, ScopeMeta])
    : scope.objects.list([ModelComponent, Symlink, Lane]);
}
