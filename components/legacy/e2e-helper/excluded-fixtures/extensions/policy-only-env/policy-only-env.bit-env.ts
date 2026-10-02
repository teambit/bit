// @bit-no-check
// @ts-nocheck

/**
 * an env that extends nothing. it provides no compiler, tester or preview - everything it
 * contributes comes from its env.jsonc (a dependency policy). because it imports no base env, its
 * only install is the `.bit-env` plugin provider (teambit.envs/env).
 */
export class PolicyOnlyEnv {
  name = 'policy-only-env';
}

export default new PolicyOnlyEnv();
