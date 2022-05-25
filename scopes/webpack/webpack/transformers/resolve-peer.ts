import fs, { realpathSync } from 'fs';
import { ResolverFactory, CachedInputFileSystem } from 'enhanced-resolve';
import findRoot from 'find-root';
import { Logger } from '@teambit/logger';

/**
 * Get the package folder, and in case it's not found get the resolved file path
 * @param peerName
 * @returns
 */
export function resolvePeerToDirOrFile(peerName: string, logger: Logger, hostRootDir?: string): string | undefined {
  let resolved;
  try {
    const options = {
      // resolve the host root dir to its real location, as require.resolve is preserve symlink, so we get wrong result otherwise
      paths: [process.cwd(), __dirname],
    };
    if (hostRootDir) {
      // resolve the host root dir to its real location, as require.resolve is preserve symlink, so we get wrong result otherwise
      options.paths.unshift(realpathSync(hostRootDir));
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

/**
 * Make sure to resolve the peer path correctly
 * we first resolve it to its dir (to be aligned with the aliases transformer)
 * Then we resolve it to specific file, using enhanced resolve to make sure we resolve it using the correct main fields order
 * @param peer
 */
export function resolvePeerToFile(peer: string, logger: Logger, hostRootDir?: string): string | undefined {
  const dirOrFile = resolvePeerToDirOrFile(peer, logger, hostRootDir);
  if (!dirOrFile) return undefined;
  const resolver = createResolver();
  const resolvedFile = resolver.resolveSync({}, '', dirOrFile);
  return resolvedFile;
}

/**
 * Generate a resolver that will read first the module field then the main field
 * to make it compatible with webpack behavior
 * @returns
 */
function createResolver() {
  // create a resolver
  const myResolver = ResolverFactory.createResolver({
    fileSystem: new CachedInputFileSystem(fs, 4000),
    useSyncFileSystemCalls: true,
    mainFields: ['module', 'main'],
  });
  return myResolver;
}
