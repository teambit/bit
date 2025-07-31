import type { Pipeline } from './pipeline';

export interface BuilderEnv {
  /**
   * return a build pipeline instance.
   */
  build(): Pipeline;
  /**
   * return a snap pipeline instance.
   */
  snap(): Pipeline;
  /**
   * return a tag pipeline instance.
   */
  tag(): Pipeline;
}
