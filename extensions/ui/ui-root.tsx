import { ProxyConfigArrayItem } from 'webpack-dev-server';
import { Component } from '@teambit/component';
import { ComponentDir } from '@teambit/bundler/get-entry';
import { AspectDefinition } from '../aspect-loader/aspect-definition';
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
   * paths for all extensions to load.
   */
  extensionsPaths: string[];

  /**
   * resolve all aspects in the UI root.
   */
  resolveAspects(): Promise<AspectDefinition[]>;

  /**
   * paths for all extensions to load.
   */
  aspectPaths: string[];

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
