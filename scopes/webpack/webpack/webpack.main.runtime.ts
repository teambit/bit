import type { Configuration } from 'webpack';
import type * as WDS from 'webpack-dev-server';
import type { WebpackConfigMutator } from '@teambit/webpack.modules.config-mutator';
import type { PubsubMain } from '@teambit/pubsub';
import { PubsubAspect } from '@teambit/pubsub';
import type { BundlerMode, Target, DevServerContext } from '@teambit/bundler';
import { MainRuntime } from '@teambit/cli';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';

import { WebpackAspect } from './webpack.aspect';

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

//@ts-ignore - ignoring ts errors here because WDS.Configuration is a complex type that might break
// between versions, leads to errors such as:
// error TS2430: Interface 'WebpackConfigWithDevServer' incorrectly extends interface 'Configuration'.
export interface WebpackConfigWithDevServer extends Configuration {
  devServer: WDS.Configuration;
  favicon?: string;
}

/**
 * @deprecated component previews/apps no longer build through this aspect - the react/node/aspect
 * envs bundle with `@teambit/webpack.webpack-bundler` and `@teambit/webpack.webpack-dev-server`
 * directly (see
 * https://bit.cloud/teambit/webpack/~change-requests/decouple-webpack-bundler-from-webpack-aspect).
 * `createBundler`/`createDevServer` have been removed; use those packages instead. Kept only so the
 * aspect still loads for backward compatibility.
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
     * Logger extension
     */
    public logger: Logger
  ) {}

  static slots = [];

  static runtime = MainRuntime;
  static dependencies = [PubsubAspect, WorkspaceAspect, LoggerAspect];

  static async provider([pubsub, workspace, logger]: [PubsubMain, Workspace, LoggerMain]) {
    const logPublisher = logger.createLogger(WebpackAspect.id);
    return new WebpackMain(pubsub, workspace, logPublisher);
  }
}

WebpackAspect.addRuntime(WebpackMain);
