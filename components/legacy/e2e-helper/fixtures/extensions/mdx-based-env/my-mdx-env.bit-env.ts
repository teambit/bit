// @bit-no-check
// @ts-nocheck
import { MdxEnv } from '@teambit/mdx.mdx-env';

export class MyMdxEnv extends MdxEnv {
  /**
   * name of the environment. used for friendly mentions across bit.
   */
  name = 'my-custom-mdx';
}

export default new MyMdxEnv();
