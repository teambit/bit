import type { WebpackConfigWithDevServer } from '@teambit/webpack';

export default function envConfig(envId: string): WebpackConfigWithDevServer {
  return {
    devServer: {
      webSocketServer: {
        options: {
          path: `/_hmr/${envId}`,
          // port is automatically matchs WDS
        },
      },
      client: {
        // public, sockHost, sockPath, and sockPort options were removed in favor client.webSocketURL option:
        webSocketURL: {
          pathname: `_hmr/${envId}`,
          // port is automatically matchs the website.
        },
      },
    },
  };
}
