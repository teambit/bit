import { BuildContext } from '../builder';
import { Capsule } from '../isolator';

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
  entry: string[];
  targets: Target[];
}
