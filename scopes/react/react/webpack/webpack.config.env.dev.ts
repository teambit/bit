import type { WebpackConfigWithDevServer } from '@teambit/webpack';

export default function envConfig(envId: string): WebpackConfigWithDevServer {
  return {
    devServer: {
      client: {
        // public, sockHost, sockPath, and sockPort options were removed in favor client.webSocketURL option:
        webSocketURL: {
          pathname: `_hmr/${envId}`,
        },
      },
    },
  };
}
