import findRoot from 'find-root';
import { Logger } from '@teambit/logger';

/**
 * Get the package folder, and in case it's not found get the resolved file path
 * @param peerName
 * @returns
 */
export function getResolvedDirOrFile(peerName: string, logger: Logger, hostRootDir?: string): string | undefined {
  let resolved;
  try {
    let options;
    if (hostRootDir) {
      options = {
        paths: [hostRootDir, __dirname],
      };
    }
    resolved = require.resolve(peerName, options);
    const folder = findRoot(resolved);
    return folder;
  } catch (e) {
    if (resolved) {
      logger.warn(`Couldn't find root dir for "${peerName}" from path "${resolved}" to add it as webpack alias`);
    } else {
      logger.warn(`Couldn't resolve "${peerName}" to add it as webpack alias`);
    }
    return resolved;
  }
}
