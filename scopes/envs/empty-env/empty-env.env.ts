/**
 * EmptyEnv - A minimal empty environment used as the default fallback.
 * This env has no compiler, tester, linter, or any other tools configured.
 * It's used as the default env when no other env is specified.
 */
export class EmptyEnv {
  /**
   * mandatory! otherwise, it is not recognized as an env. (see getEnvDescriptorFromEnvDef)
   */
  async __getDescriptor() {
    return {
      type: 'empty',
    };
  }
}

export default new EmptyEnv();
