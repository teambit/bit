import npmRegistryName from './npm-registry-name';
import { NODE_PATH_COMPONENT_SEPARATOR } from '../../constants';
import BitId from '../../bit-id/bit-id';
import { ExtensionDataList } from '../../consumer/config/extension-data';
import { replacePlaceHolderForPackageName } from './component-placeholders';

/**
 * convert a component name to a valid npm package name
 * e.g. BitId { scope: util, name: is-string } => @bit/util.is-string
 */
export default function componentIdToPackageName({
  id,
  bindingPrefix,
  defaultScope,
  withPrefix = true,
  extensions
}: {
  id: BitId;
  bindingPrefix: string | null | undefined;
  defaultScope?: string | null; // if an id doesn't have a scope, use defaultScope if exists
  withPrefix?: boolean;
  extensions: ExtensionDataList;
}): string {
  const fromExtensions = getNameFromExtensions(id, extensions);
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

function getNameFromExtensions(id: BitId, extensions: ExtensionDataList): null | string {
  const pkgExt = extensions.findExtension('@teambit/pkg');
  if (!pkgExt) return null;
  const name = pkgExt.config?.packageJson?.name;
  if (!name) return null;
  return replacePlaceHolderForPackageName({ name: id.name, scope: id.scope }, name);
}
