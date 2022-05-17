import camelcase from 'camelcase';
import 'expose-loader';
import { Logger } from '@teambit/logger';
import { generateExposeLoaders } from '@teambit/webpack.modules.generate-expose-loaders';
import { resolvePeerToFile } from './resolve-peer';

export function getExposedRules(peers: string[], logger: Logger, hostRootDir?: string) {
  const loaderPath = require.resolve('expose-loader');
  const depsEntries = peers.map((peer) => ({
    path: resolvePeerToFile(peer, logger, hostRootDir),
    globalName: camelcase(peer.replace('@', '').replace('/', '-'), { pascalCase: true }),
  }));
  return generateExposeLoaders(depsEntries, { loaderPath });
}
