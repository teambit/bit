export type {
  WebpackMain,
  WebpackConfigTransformer,
  WebpackConfigTransformContext,
  WebpackConfigDevServerTransformContext,
  GlobalWebpackConfigTransformContext,
  WebpackConfigDevServerTransformer,
} from './webpack.main.runtime';
export { runTransformersWithContext } from './run-transformer';
export { WebpackAspect } from './webpack.aspect';
export { WebpackDevServer } from './webpack.dev-server';
export { WebpackBundler } from './webpack.bundler';
export type { WebpackConfigWithDevServer } from './webpack.dev-server';
export * from './events';
export type { Configuration } from 'webpack';
export { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
export { WebpackBitReporterPlugin } from './plugins/webpack-bit-reporter-plugin';
export { fallbacks } from './config/webpack-fallbacks';
export { fallbacksAliases } from './config/webpack-fallbacks-aliases';
export { fallbacksProvidePluginConfig } from './config/webpack-fallbacks-provide-plugin-config';
export {
  GenerateBodyInjectionTransformer,
  BodyInjectionOptions,
  generateAddAliasesFromPeersTransformer,
  generateExposePeersTransformer,
  generateExternalsTransformer,
  GenerateHeadInjectionTransformer,
  HeadInjectionOptions,
} from './transformers';
