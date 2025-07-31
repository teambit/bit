import type { EnvService, Env, EnvContext, ServiceTransformationMap } from '@teambit/envs';
import type { Bundler } from './bundler';
import type { BundlerContext } from './bundler-context';

type BundlerTransformationMap = ServiceTransformationMap & {
  getBundler?: (context: BundlerContext) => Promise<Bundler>;
};
export class BundlerService implements EnvService<any> {
  name = 'bundler';

  transform(env: Env, envContext: EnvContext): BundlerTransformationMap | undefined {
    // Old env
    if (!env?.preview) return undefined;
    const preview = env.preview()(envContext);

    return {
      getBundler: (context) => preview.getBundler(context)(envContext),
    };
  }
}
