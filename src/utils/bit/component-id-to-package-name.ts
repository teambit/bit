import npmRegistryName from './npm-registry-name';
import { NODE_PATH_COMPONENT_SEPARATOR } from '../../constants';
import BitId from '../../bit-id/bit-id';

/**
 * convert a component name to a valid npm package name
 */
export default function componentIdToPackageName(
  id: BitId,
  bindingPrefix: string | null | undefined,
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  withPrefix? = true
): string {
  const nameWithoutPrefix = `${id.toStringWithoutVersion().replace(/\//g, NODE_PATH_COMPONENT_SEPARATOR)}`;
  if (!withPrefix) return nameWithoutPrefix;
  const registryPrefix = bindingPrefix || npmRegistryName();
  return `${registryPrefix}/${nameWithoutPrefix}`;
}
