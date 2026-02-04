import type { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';

export function generatePathInfoTransformer() {
  return (config: WebpackConfigMutator): WebpackConfigMutator => {
    config.raw.output = {
      ...config.raw.output,
      pathinfo: false,
    };
    return config;
  };
}

export function generateFilesystemCacheTransformer(configFile: string) {
  return (config: WebpackConfigMutator): WebpackConfigMutator => {
    config.raw.cache = {
      type: 'filesystem',
      compression: false,
      buildDependencies: {
        config: [configFile],
      },
    };
    return config;
  };
}
