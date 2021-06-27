import type { WebpackConfigWithDevServer } from '@teambit/webpack';

export default function (envId: string): WebpackConfigWithDevServer {
  return {
    devServer: {
      // @ts-ignore - remove this once there is types package for webpack-dev-server v4
      client: {
        path: `_hmr/${envId}`,
      },
    },
  };
}
