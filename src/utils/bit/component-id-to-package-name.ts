import BitId from '../../bit-id/bit-id';
import { Extensions, NODE_PATH_COMPONENT_SEPARATOR } from '../../constants';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import { replacePlaceHolderForPackageValue } from './component-placeholders';
import npmRegistryName from './npm-registry-name';
import { parseScope } from './parse-scope';

/**
 * convert a component name to a valid npm package name
 * e.g. BitId { scope: util, name: is-string } => @bit/util.is-string
 */
export default function componentIdToPackageName({
  id,
  bindingPrefix,
  defaultScope,
  withPrefix = true,
  extensions,
  isDependency = false,
}: {
  id: BitId;
  bindingPrefix: string | null | undefined;
  defaultScope?: string | null; // if an id doesn't have a scope, use defaultScope if exists
  withPrefix?: boolean;
  extensions: ExtensionDataList;
  isDependency?: boolean;
}): string {
  const fromExtensions = getNameFromExtensions(id, defaultScope, extensions, isDependency);
  if (fromExtensions) return fromExtensions;
  const allSlashes = new RegExp('/', 'g');
  const name = id.name.replace(allSlashes, NODE_PATH_COMPONENT_SEPARATOR);
  const scope = id.scope || defaultScope;
  const partsToJoin = scope ? [scope, name] : [name];
  let nameWithoutPrefix = partsToJoin.join(NODE_PATH_COMPONENT_SEPARATOR);
  if (!withPrefix) return nameWithoutPrefix;
  const registryPrefix = bindingPrefix || npmRegistryName();
  // Make sure we don't have the prefix also as part of the scope name
  // since prefixes are now taken from the owner name, and the scope name has the owner name as well.
  const registryPrefixWithDotWithoutAt = `${registryPrefix}.`.replace('@', '');
  if (nameWithoutPrefix.startsWith(registryPrefixWithDotWithoutAt) && registryPrefix !== '@bit') {
    nameWithoutPrefix = nameWithoutPrefix.replace(registryPrefixWithDotWithoutAt, '');
  }

  return `${registryPrefix}/${nameWithoutPrefix}`;
}

function getNameFromExtensions(
  id: BitId,
  defaultScope?: string | null,
  extensions?: ExtensionDataList,
  isDependency?: boolean
): null | string {
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
          d.componentId = BitId.parse(d.componentId);
        } else {
          d.componentId = new BitId(d.componentId);
        }
      }
      return d.componentId.isEqual(id);
    });
    return dep ? dep.packageName : null;
  }
  const pkgExt = extensions.findExtension(Extensions.pkg);
  if (!pkgExt) return null;
  const name = pkgExt.config?.packageJson?.name;
  const scopeId = id.scope || defaultScope;
  const { scope, owner } = parseScope(scopeId);
  if (!name) return null;
  return replacePlaceHolderForPackageValue({ name: id.name, scope, owner, scopeId }, name);
}
