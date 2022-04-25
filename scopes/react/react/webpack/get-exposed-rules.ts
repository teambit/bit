import camelcase from 'camelcase';
import 'expose-loader';
import { generateExposeLoaders } from '@teambit/webpack.modules.generate-expose-loaders';

export function getExposedRules(peers: string[], hostRootDir?: string) {
  const loaderPath = require.resolve('expose-loader');
  let options;
  if (hostRootDir) {
    options = {
      paths: [hostRootDir, __dirname],
    };
  }
  const depsEntries = peers.map((peer) => ({
    path: require.resolve(peer, options),
    globalName: camelcase(peer.replace('@', '').replace('/', '-'), { pascalCase: true }),
  }));
  return generateExposeLoaders(depsEntries, { loaderPath });
}
