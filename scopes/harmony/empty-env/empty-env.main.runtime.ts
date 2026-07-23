import { MainRuntime } from '@teambit/cli';
import type { Environment, EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import { EmptyEnvAspect } from './empty-env.aspect';

export const EmptyEnvType = 'empty';

/**
 * the default env for components that were not configured with any env. it intentionally provides
 * nothing - no compiler, no tester, no preview, no dependencies policy - so components are used
 * as-source and bit works fully offline out of the box.
 *
 * it has no behavior on purpose: any behavior baked into a core env changes components' output
 * when bit itself changes, without any env-version bump. to get a development experience (compile,
 * test, lint, docs), configure a real env, e.g. `bit env set my-component teambit.harmony/node`.
 */
export class EmptyEnv implements Environment {
  name = 'empty';

  icon = 'https://static.bit.dev/extensions-icons/default.svg';

  description = 'default env, provides no development tooling. configure an env to get one';

  async __getDescriptor() {
    return {
      type: EmptyEnvType,
    };
  }
}

export class EmptyEnvMain {
  constructor(readonly emptyEnv: EmptyEnv) {}

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect];

  static async provider([envs]: [EnvsMain]) {
    const emptyEnv = new EmptyEnv();
    envs.registerEnv(emptyEnv);
    return new EmptyEnvMain(emptyEnv);
  }
}

EmptyEnvAspect.addRuntime(EmptyEnvMain);
