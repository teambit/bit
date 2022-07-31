import { WebpackConfigMutator } from '@teambit/webpack';

export function addDevServer(configMutator: WebpackConfigMutator) {
  return configMutator.addTopLevel('devServer', {
    historyApiFallback: {
      index: '/index.html',
      disableDotRule: true,
      headers: {
        'Access-Control-Allow-Headers': '*',
      },
    },
  });
}

export function setOutput(configMutator: WebpackConfigMutator) {
  if (!configMutator.raw.output) configMutator.raw.output = {};
  configMutator.raw.output.publicPath = '/';

  return configMutator;
}
