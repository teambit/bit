// @bit-no-check
// @ts-nocheck
import { NodeEnv } from '@teambit/node.node';

export class MyNodeEnv extends NodeEnv {
  /**
   * name of the environment. used for friendly mentions across bit.
   */
  name = 'my-custom-node';
}

export default new MyNodeEnv();
