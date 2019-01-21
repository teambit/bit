// @flow
import npmRegistryName from './npm-registry-name';
import { NODE_PATH_COMPONENT_SEPARATOR } from '../../constants';
import BitId from '../../bit-id/bit-id';

/**
 * convert a component name to a valid npm package name
 */
export default function componentIdToPackageName(
  id: BitId,
  options?: { withVersion?: boolean, withPrefix?: boolean } = {}
): string {
  const { withVersion = false, withPrefix = true } = options;
  const getName = () => {
    const nameWithoutPrefix = `${id.toStringWithoutVersion().replace(/\//g, NODE_PATH_COMPONENT_SEPARATOR)}`;
    if (!withPrefix) return nameWithoutPrefix;
    const registryPrefix = npmRegistryName();
    return `${registryPrefix}/${nameWithoutPrefix}`;
  };

  const npmName = getName();
  // $FlowFixMe the id here has a version
  return withVersion ? `${npmName}@${id.version}` : npmName;
}
