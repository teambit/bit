import type { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import type { WebpackConfigDevServerTransformer, WebpackConfigTransformer } from './webpack.main.runtime';

/**
 * @deprecated equivalent to `@teambit/webpack.webpack-bundler`'s `runTransformers`. Kept only for
 * backward-compatible `from '@teambit/webpack'` imports.
 */
export function runTransformersWithContext(
  config: WebpackConfigMutator,
  transformers: Array<WebpackConfigTransformer | WebpackConfigDevServerTransformer> = [],
  // context: WebpackConfigTransformContext | WebpackConfigDevServerTransformContext
  context: any
): WebpackConfigMutator {
  if (!Array.isArray(transformers)) return config;
  const newConfig = transformers.reduce((acc, transformer) => {
    return transformer(acc, context);
  }, config);
  return newConfig;
}
