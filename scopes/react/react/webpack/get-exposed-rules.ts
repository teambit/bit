import camelcase from 'camelcase';
import 'expose-loader';
import { generateExposeLoaders } from '@teambit/webpack.modules.generate-expose-loaders';

export function getExposedRules(peers: string[]) {
  const loaderPath = require.resolve('expose-loader');
  const depsEntries = peers.map((peer) => ({
    path: require.resolve(peer),
    globalName: camelcase(peer.replace('@', '').replace('/', '-'), { pascalCase: true }),
  }));
  return generateExposeLoaders(depsEntries, { loaderPath });
}
