/**
 * @deprecated component previews/apps no longer build through this aspect - the react/node/aspect
 * envs bundle with `@teambit/webpack.webpack-bundler` and `@teambit/webpack.webpack-dev-server`
 * directly (see
 * https://bit.cloud/teambit/webpack/~change-requests/decouple-webpack-bundler-from-webpack-aspect).
 * Everything below is kept only for backward-compatible `from '@teambit/webpack'` imports; see each
 * export's own `@deprecated` note for where to source it from instead.
 */
export type {
  WebpackMain,
  WebpackConfigTransformer,
  WebpackConfigTransformContext,
  WebpackConfigDevServerTransformContext,
  GlobalWebpackConfigTransformContext,
  WebpackConfigDevServerTransformer,
  WebpackConfigWithDevServer,
} from './webpack.main.runtime';
export { runTransformersWithContext } from './run-transformer';
export { WebpackAspect } from './webpack.aspect';
export { WebpackCompilationDoneEvent, WebpackCompilationStartedEvent } from './events';
/**
 * @deprecated import directly from `webpack` instead.
 */
export type { Configuration } from 'webpack';
/**
 * @deprecated import directly from `@teambit/webpack.modules.config-mutator` instead.
 */
export { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
export { WebpackBitReporterPlugin } from './plugins/webpack-bit-reporter-plugin';
export { fallbacks } from './config/webpack-fallbacks';
export { fallbacksAliases } from './config/webpack-fallbacks-aliases';
export { fallbacksProvidePluginConfig } from './config/webpack-fallbacks-provide-plugin-config';
export {
  GenerateBodyInjectionTransformer,
  BodyInjectionOptions,
  generateAddAliasesFromPeersTransformer,
  generateExternalsTransformer,
  GenerateHeadInjectionTransformer,
  HeadInjectionOptions,
} from './transformers';
