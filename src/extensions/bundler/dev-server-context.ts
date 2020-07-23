import { BuildContext } from '../builder';

export type Target = {
  /**
   * entries of the target.
   */
  entries: string[];

  /**
   * root path of the target
   */
  path: string;
};

export interface BundlerContext extends BuildContext {
  entry: string[];
  targets: Target[];
}
