import { Component } from '@teambit/component';
import { BuildContext } from '@teambit/builder';
import { ExecutionContext } from '@teambit/envs';

export type Target = {
  /**
   * entries of the target.
   */
  entries: string[];

  /**
   * array of components included in the target.
   */
  components: Component[];

  /**
   * output path of the target
   */
  outputPath: string;
};

export interface BundlerContext extends BuildContext {
  targets: Target[];
  publicPath?: string;
  rootPath?: string;
}

export interface DevServerContext extends ExecutionContext {
  /**
   * array of files to include.
   */
  entry: string[];

  /**
   * public path.
   */
  publicPath?: string;

  /**
   * root path of the workspace.
   */
  rootPath?: string;

  /**
   * title of the page.
   */
  title?: string;
}
