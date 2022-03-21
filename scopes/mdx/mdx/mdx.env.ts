import { Environment } from '@teambit/envs';

export const MdxEnvType = 'mdx';

export class MdxEnv implements Environment {
  async __getDescriptor() {
    return {
      type: MdxEnvType,
    };
  }
}
