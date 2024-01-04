import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import type { WebpackConfigDevServerTransformer, WebpackConfigTransformer } from './webpack.main.runtime';

export function runTransformersWithContext(
  config: WebpackConfigMutator,
  transformers: Array<WebpackConfigTransformer | WebpackConfigDevServerTransformer> = [],
  // context: WebpackConfigTransformContext | WebpackConfigDevServerTransformContext
  context: any
): WebpackConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    // @ts-ignore
    return transformer(acc, context);
  }, config);
  return newConfig;
}
