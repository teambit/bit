import { AspectDefinition } from '@teambit/aspect-loader';
import { ComponentDir } from '@teambit/bundler/get-entry';
import { Component } from '@teambit/component';
import { ProxyConfigArrayItem } from 'webpack-dev-server';
// import { WebpackDevServer } from '../webpack/webpack.dev-server';

// TODO: remove this extends "ComponentDir", this should be part of the workspace alone since scope
// would never have componentDir and as it has nothing to do with `UIRoot`.
export interface UIRoot extends ComponentDir {
  /**
   * unique name of the ui.
   */
  name: string;

  /**
   * path of the ui root.
   */
  path: string;

  /**
   * name of the UI root config file.
   */
  configFile: string;

  /**
   * resolve all aspects in the UI root.
   */
  resolveAspects(runtimeName: string): Promise<AspectDefinition[]>;

  /**
   * resolve components from a given pattern.
   */
  resolvePattern(pattern: string): Promise<Component[]>;

  /**
   * listener for when the dev server starts. can be used for running the watcher.
   */
  postStart?(options: PostStartOptions): Promise<void>;

  /**
   * determine whether UI should get a priority.
   */
  priority?: boolean;

  getProxy?: () => Promise<ProxyEntry[]>;
}

export type ProxyEntry = ProxyConfigArrayItem & {
  context: string[]; // limit type to simplify our code. (not required)
};

export type PostStartOptions = {
  /**
   * pattern for selecting components in the container.
   */
  pattern?: string;
};
