import camelcase from 'camelcase';
import 'expose-loader';
import { Logger } from '@teambit/logger';
import { generateExposeLoaders } from '@teambit/webpack.modules.generate-expose-loaders';
import { compact } from 'lodash';
import { resolvePeerToFile } from './resolve-peer';

export function getExposedRules(peers: string[], logger: Logger, hostRootDir?: string) {
  const loaderPath = require.resolve('expose-loader');
  const depsEntries = peers.map((peer) => {
    const resolvedPath = resolvePeerToFile(peer, logger, hostRootDir);
    if (!resolvedPath) return undefined;
    return {
      path: resolvedPath,
      globalName: camelcase(peer.replace('@', '').replace('/', '-'), { pascalCase: true }),
    };
  });
  return generateExposeLoaders(compact(depsEntries), { loaderPath });
}
