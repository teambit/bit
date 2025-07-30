import { ComponentID } from '@teambit/component-id';
import { Extensions, NODE_PATH_COMPONENT_SEPARATOR } from '@teambit/legacy.constants';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import { parseScope, replacePlaceHolderForPackageValue } from '@teambit/legacy.utils';
import { getBindingPrefixByDefaultScope } from '@teambit/legacy.consumer-config';

/**
 * convert a component name to a valid npm package name
 * e.g. { scope: util, name: is-string } => @bit/util.is-string
 */
export function componentIdToPackageName({
  id,
  bindingPrefix,
  defaultScope,
  extensions,
  isDependency = false,
}: {
  id: ComponentID;
  bindingPrefix?: string;
  defaultScope?: string | null; // if an id doesn't have a scope, use defaultScope if exists
  extensions: ExtensionDataList;
  isDependency?: boolean;
}): string {
  const fromExtensions = getNameFromExtensions(id, extensions, isDependency);
  if (fromExtensions) return fromExtensions;
  const allSlashes = new RegExp('/', 'g');
  const name = id.fullName.replace(allSlashes, NODE_PATH_COMPONENT_SEPARATOR);
  const scope = id.scope;
  const partsToJoin = [scope, name];
  let nameWithoutPrefix = partsToJoin.join(NODE_PATH_COMPONENT_SEPARATOR);
  const registryPrefix = bindingPrefix || getBindingPrefixByDefaultScope(defaultScope || scope);
  // Make sure we don't have the prefix also as part of the scope name
  // since prefixes are now taken from the owner name, and the scope name has the owner name as well.
  const registryPrefixWithDotWithoutAt = `${registryPrefix}.`.replace('@', '');
  if (nameWithoutPrefix.startsWith(registryPrefixWithDotWithoutAt) && registryPrefix !== '@bit') {
    nameWithoutPrefix = nameWithoutPrefix.replace(registryPrefixWithDotWithoutAt, '');
  }

  return `${registryPrefix}/${nameWithoutPrefix}`;
}

function getNameFromExtensions(id: ComponentID, extensions?: ExtensionDataList, isDependency?: boolean): null | string {
  if (!extensions) return null;
  if (isDependency) {
    const dependencyResolverExt = extensions.findExtension(Extensions.dependencyResolver);
    if (!dependencyResolverExt || !dependencyResolverExt.data.dependencies) return null;
    const dep = dependencyResolverExt.data.dependencies.find((d) => {
      if (d.__type !== 'component') {
        return false;
      }
      if (!d.componentId.isEqual) {
        if (typeof d.componentId === 'string') {
          d.componentId = ComponentID.fromString(d.componentId);
        } else {
          d.componentId = ComponentID.fromObject(d.componentId);
        }
      }
      return d.componentId.isEqual(id);
    });
    return dep ? dep.packageName : null;
  }
  const pkgExt = extensions.findExtension(Extensions.pkg);
  if (!pkgExt) return null;
  const name = pkgExt.config?.packageJson?.name;
  const scopeId = id.scope;
  const { scope, owner } = parseScope(scopeId);
  if (!name) return null;
  return replacePlaceHolderForPackageValue({ name: id.fullName, scope, owner, scopeId }, name);
}
