import urlJoin from 'url-join';
import type { ComponentID } from '@teambit/component-id';
import { ComponentUrl } from '@teambit/component.modules.component-url';

export function calcComponentLink(id: ComponentID | undefined, exported: boolean | undefined) {
  if (!id) return undefined;
  if (exported) return ComponentUrl.toUrl(id);
  return urlJoin('/', id.fullName);
}
