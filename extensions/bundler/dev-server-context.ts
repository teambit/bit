import { Component } from '@teambit/component';
import { BuildContext } from '@teambit/builder';
import { ExecutionContext } from '@teambit/environments';

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
  entry: string[];
  publicPath?: string;
  rootPath?: string;
}
