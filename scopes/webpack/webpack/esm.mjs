// eslint-disable-next-line import/no-unresolved
import cjsModule from './index.js';

export const runTransformersWithContext = cjsModule.runTransformersWithContext;
export const WebpackAspect = cjsModule.WebpackAspect;
export const WebpackDevServer = cjsModule.WebpackDevServer;
export const WebpackBundler = cjsModule.WebpackBundler;
export const WebpackConfigMutator = cjsModule.WebpackConfigMutator;
export const WebpackBitReporterPlugin = cjsModule.WebpackBitReporterPlugin;
export const fallbacks = cjsModule.fallbacks;
export const fallbacksAliases = cjsModule.fallbacksAliases;
export const fallbacksProvidePluginConfig = cjsModule.fallbacksProvidePluginConfig;
export const GenerateBodyInjectionTransformer = cjsModule.GenerateBodyInjectionTransformer;
export const BodyInjectionOptions = cjsModule.BodyInjectionOptions;
export const generateAddAliasesFromPeersTransformer = cjsModule.generateAddAliasesFromPeersTransformer;
export const generateExposePeersTransformer = cjsModule.generateExposePeersTransformer;
export const generateExternalsTransformer = cjsModule.generateExternalsTransformer;
export const GenerateHeadInjectionTransformer = cjsModule.GenerateHeadInjectionTransformer;
export const HeadInjectionOptions = cjsModule.HeadInjectionOptions;

export default cjsModule;
