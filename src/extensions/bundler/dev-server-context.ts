import { BuildContext } from '../builder';
import { Capsule } from '../isolator';
import { ExecutionContext } from '../environments';

export type Target = {
  /**
   * entries of the target.
   */
  entries: string[];

  /**
   * root path of the target
   */
  capsule: Capsule;
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
