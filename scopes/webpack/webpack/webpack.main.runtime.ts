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

export type WebpackConfigTransformContext = GlobalWebpackConfigTransformContext & {
  target: Target;
};

export type WebpackConfigDevServerTransformContext = GlobalWebpackConfigTransformContext & DevServerContext;

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

export type WebpackConfigTransformer = (
  config: WebpackConfigMutator,
  context: WebpackConfigTransformContext
) => WebpackConfigMutator;

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
