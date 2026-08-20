import type { Configuration } from 'webpack';
import webpack from 'webpack';
import type { PubsubMain } from '@teambit/pubsub';
import { PubsubAspect } from '@teambit/pubsub';
import type { BundlerContext, BundlerMain, DevServer, DevServerContext, BundlerMode, Target } from '@teambit/bundler';
import { BundlerAspect } from '@teambit/bundler';
import { MainRuntime } from '@teambit/cli';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { merge } from 'webpack-merge';
// We want to import it to make sure bit recognizes it as a dependency
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import WsDevServer from 'webpack-dev-server';
import { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';

import { generateAddAliasesFromPeersTransformer, generateExternalsTransformer } from './transformers';
import { configFactory as devServerConfigFactory } from './config/webpack.dev.config';
import { configFactory as baseConfigFactory } from './config/webpack.config';

import { WebpackAspect } from './webpack.aspect';
import { WebpackBundler } from './webpack.bundler';
import { WebpackDevServer } from './webpack.dev-server';
import { runTransformersWithContext } from './run-transformer';

/**
 * @deprecated the bundler/dev-server that build component previews/apps no longer go through this
 * aspect - the react/node/aspect envs bundle with `@teambit/webpack.webpack-bundler` directly (see
 * https://bit.cloud/teambit/webpack/~change-requests/decouple-webpack-bundler-from-webpack-aspect).
 * Source this type from `@teambit/webpack.webpack-bundler` instead.
 */
export type WebpackConfigTransformContext = GlobalWebpackConfigTransformContext & {
  target: Target;
};

/**
 * @deprecated source from `@teambit/webpack.webpack-bundler` instead; see `WebpackConfigTransformContext`.
 */
export type WebpackConfigDevServerTransformContext = GlobalWebpackConfigTransformContext & DevServerContext;

/**
 * @deprecated source from `@teambit/webpack.webpack-bundler` instead; see `WebpackConfigTransformContext`.
 */
export type GlobalWebpackConfigTransformContext = {
  mode: BundlerMode;
  /**
   * Whether the config is for an env template bundling
   */
  isEnvTemplate?: boolean;
  /**
   * A path for the host root dir
   * Host root dir is usually the env root dir
   * This can be used in different bundle options which run require.resolve
   * for example when configuring webpack aliases or webpack expose loader on the peers deps
   */
  hostRootDir?: string;
};

/**
 * @deprecated source from `@teambit/webpack.webpack-bundler` instead; see `WebpackConfigTransformContext`.
 * Constructing this against `@teambit/webpack`'s own `WebpackConfigMutator` re-export and applying
 * it to a config built by `@teambit/webpack.webpack-bundler` mixes two independently-resolved
 * webpack instances.
 */
export type WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) => WebpackConfigMutator;

/**
 * @deprecated source from `@teambit/webpack.webpack-dev-server` instead; see `WebpackConfigTransformContext`.
 */
export type WebpackConfigDevServerTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigDevServerTransformContext
) => WebpackConfigMutator;

/**
 * @deprecated component previews/apps no longer build through this aspect - the react/node/aspect
 * envs bundle with `@teambit/webpack.webpack-bundler` and `@teambit/webpack.webpack-dev-server`
 * directly (see
 * https://bit.cloud/teambit/webpack/~change-requests/decouple-webpack-bundler-from-webpack-aspect).
 * `createBundler`/`createDevServer` will be removed in a follow-up; use those packages instead.
 */
export class WebpackMain {
  constructor(
    /**
     * Pubsub extension.
     */
    public pubsub: PubsubMain,

    /**
     * workspace extension.
     */
    private workspace: Workspace,

    /**
     * bundler extension.
     */
    private bundler: BundlerMain,

    /**
     * Logger extension
     */
    public logger: Logger
  ) {}

  /**
   * create an instance of bit-compliant webpack dev server for a set of components
   * @deprecated use `@teambit/webpack.webpack-dev-server`'s `WebpackDevServer.from`/`.create` instead.
   */
  createDevServer(
    context: DevServerContext,
    transformers: WebpackConfigTransformer[] = [],
    webpackModulePath?: string,
    webpackDevServerModulePath?: string
  ): DevServer {
    const config = this.createDevServerConfig(
      context.entry,
      this.workspace.path,
      context.id,
      context.rootPath,
      context.publicPath,
      this.workspace.getComponentPathsRegExps(),
      context.title
    ) as any;
    const wdsPath = webpackDevServerModulePath || require.resolve('webpack-dev-server');
    const configMutator = new WebpackConfigMutator(config);
    const transformerContext: WebpackConfigDevServerTransformContext = Object.assign(context, { mode: 'dev' as const });
    const internalTransformers = this.generateTransformers(undefined, transformerContext);

    const afterMutation = runTransformersWithContext(
      configMutator.clone(),
      [...internalTransformers, ...transformers],
      transformerContext
    );
    return new WebpackDevServer(afterMutation.raw, this.getWebpackInstance(webpackModulePath, webpack), wdsPath);
  }

  /**
   * @deprecated thin wrapper around `webpack-merge`; call it directly instead.
   */
  mergeConfig(target: any, source: any): any {
    return merge(target, source);
  }

  /**
   * @deprecated use `@teambit/webpack.webpack-bundler`'s `WebpackBundler.from`/`.create` instead.
   */
  createBundler(
    context: BundlerContext,
    transformers: WebpackConfigTransformer[] = [],
    initialConfigs?: webpack.Configuration[],
    webpackModuleOrPath?: string | any
  ) {
    const transformerContext: GlobalWebpackConfigTransformContext = {
      mode: 'prod',
      isEnvTemplate: context.metaData?.isEnvTemplate,
    };
    // eslint-disable-next-line max-len
    const configs =
      initialConfigs ||
      this.createConfigs(context.targets, baseConfigFactory, transformers, transformerContext, context);
    return new WebpackBundler(
      context.targets,
      configs,
      this.logger,
      this.getWebpackInstance(webpackModuleOrPath, webpack),
      context.metaData
    );
  }

  private createConfigs(
    targets: Target[],
    factory: (target: Target, context: BundlerContext) => Configuration,
    transformers: WebpackConfigTransformer[] = [],
    transformerContext: GlobalWebpackConfigTransformContext,
    bundlerContext: BundlerContext
  ) {
    return targets.map((target) => {
      const baseConfig = factory(target, bundlerContext);
      const configMutator = new WebpackConfigMutator(baseConfig);
      const context = Object.assign({}, transformerContext, { target });
      const internalTransformers = this.generateTransformers(context, undefined, target);
      const afterMutation = runTransformersWithContext(
        configMutator.clone(),
        [...internalTransformers, ...transformers],
        context
      );
      return afterMutation.raw;
    });
  }

  private generateTransformers(
    _bundlerContext?: WebpackConfigTransformContext,
    devServerContext?: WebpackConfigDevServerTransformContext,
    target?: Target
  ): Array<WebpackConfigTransformer> {
    const transformers: WebpackConfigTransformer[] = [];
    // TODO: handle dev server
    const hostDeps = target?.hostDependencies || devServerContext?.hostDependencies;
    if (hostDeps) {
      if (target?.aliasHostDependencies || devServerContext?.aliasHostDependencies) {
        const peerAliasesTransformer = generateAddAliasesFromPeersTransformer(hostDeps, this.logger);
        transformers.push(peerAliasesTransformer);
      }
      if (target?.externalizeHostDependencies || devServerContext?.externalizeHostDependencies) {
        const externalsTransformer = generateExternalsTransformer(hostDeps);
        transformers.push(externalsTransformer);
      }
    }
    return transformers;
  }

  private getWebpackInstance(webpackOrPath?: any | string, fallback?: any) {
    if (!webpackOrPath) {
      return fallback;
    }
    if (typeof webpackOrPath === 'string') {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return require(webpackOrPath);
    }
    return webpackOrPath;
  }

  private createDevServerConfig(
    entry: string[],
    rootPath: string,
    devServerID: string,
    publicRoot: string,
    publicPath: string,
    componentPathsRegExps: RegExp[],
    title?: string
  ) {
    return devServerConfigFactory(
      devServerID,
      rootPath,
      entry,
      publicRoot,
      publicPath,
      componentPathsRegExps,
      this.pubsub,
      title
    );
  }

  static slots = [];

  static runtime = MainRuntime;
  static dependencies = [PubsubAspect, WorkspaceAspect, BundlerAspect, LoggerAspect];

  static async provider([pubsub, workspace, bundler, logger]: [PubsubMain, Workspace, BundlerMain, LoggerMain]) {
    const logPublisher = logger.createLogger(WebpackAspect.id);
    return new WebpackMain(pubsub, workspace, bundler, logPublisher);
  }
}

WebpackAspect.addRuntime(WebpackMain);
