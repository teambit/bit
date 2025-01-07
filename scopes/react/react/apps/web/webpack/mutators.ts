import { WebpackConfigMutator } from '@teambit/webpack';
import { remove } from 'lodash';
import TerserPlugin from 'terser-webpack-plugin';

export function addDevServer(configMutator: WebpackConfigMutator) {
  return configMutator.addTopLevel('devServer', {
    allowedHosts: 'all',
    historyApiFallback: {
      index: '/index.html',
      disableDotRule: true,
    },
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function setOutput(configMutator: WebpackConfigMutator) {
  if (!configMutator.raw.output) configMutator.raw.output = {};
  configMutator.raw.output.publicPath = '/';

  return configMutator;
}

/**
 * Setting the webSocketURL to use port 0
 * This is will make the dev server to use the same port as the website
 * This is mainly required for a cases when the port is forwarded to a different port
 * For example when using online vscode instances
 * @param configMutator
 * @returns
 */
export function setDevServerClient(configMutator: WebpackConfigMutator) {
  if (!configMutator.raw.devServer) configMutator.raw.devServer = {};

  configMutator.raw.devServer.client = {
    webSocketURL: 'ws://0.0.0.0:0/ws',
  };

  return configMutator;
}

export function replaceTerserPlugin() {
  return (configMutator: WebpackConfigMutator) => {
    if (!configMutator.raw.optimization?.minimizer) return configMutator;

    remove(configMutator.raw.optimization?.minimizer, (minimizer: any) => {
      return minimizer.constructor.name === 'TerserPlugin';
    });

    const terserer = CreateTerserPlugin();
    configMutator.raw.optimization?.minimizer.push(terserer);

    return configMutator;
  };
}

function CreateTerserPlugin() {
  return new TerserPlugin({
    minify: TerserPlugin.esbuildMinify,
    // `terserOptions` options will be passed to `esbuild`
    // Link to options - https://esbuild.github.io/api/#minify
    terserOptions: {
      minify: true,
    },
  });
}
