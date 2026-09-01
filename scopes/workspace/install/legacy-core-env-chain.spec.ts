import { expect } from 'chai';
import { findLegacyCoreEnvInChain } from './legacy-core-env-chain';

const LEGACY_CORE_ENVS = ['teambit.harmony/aspect', 'teambit.harmony/node'];

/**
 * builds the queries from a plain map of env -> the env it was tagged with, which is what the
 * models of a chain of published envs amount to.
 */
function queriesFrom(envOfEnv: Record<string, string>, inWorkspace: string[] = []) {
  return {
    getEnvOf: async (envId: string) => envOfEnv[envId],
    isLegacyCoreEnv: (envId: string) => LEGACY_CORE_ENVS.includes(envId.split('@')[0]),
    isInWorkspace: (envId: string) => inWorkspace.includes(envId.split('@')[0]),
  };
}

describe('findLegacyCoreEnvInChain', () => {
  it('should return the env itself when it is already a legacy core env', async () => {
    const result = await findLegacyCoreEnvInChain('teambit.harmony/aspect', queriesFrom({}));
    expect(result).to.equal('teambit.harmony/aspect');
  });

  it('should strip the version from the returned id, so the pinned version can be looked up', async () => {
    const result = await findLegacyCoreEnvInChain(
      'my-org/envs/my-env@0.0.9',
      queriesFrom({ 'my-org/envs/my-env@0.0.9': 'teambit.harmony/aspect' })
    );
    expect(result).to.equal('teambit.harmony/aspect');
  });

  it('should follow a chain of custom envs down to the legacy core env', async () => {
    const result = await findLegacyCoreEnvInChain(
      'my-org/envs/outer@1.0.0',
      queriesFrom({
        'my-org/envs/outer@1.0.0': 'my-org/envs/middle@2.0.0',
        'my-org/envs/middle@2.0.0': 'teambit.harmony/node',
      })
    );
    expect(result).to.equal('teambit.harmony/node');
  });

  it('should return undefined when the chain ends at a custom env', async () => {
    const result = await findLegacyCoreEnvInChain(
      'my-org/envs/my-env@0.0.9',
      queriesFrom({ 'my-org/envs/my-env@0.0.9': 'my-org/envs/base@0.0.1' })
    );
    expect(result).to.be.undefined;
  });

  it('should stop at an env that is in the workspace, its own env is collected separately', async () => {
    const result = await findLegacyCoreEnvInChain(
      'my-org/envs/my-env@0.0.9',
      queriesFrom({ 'my-org/envs/my-env@0.0.9': 'teambit.harmony/aspect' }, ['my-org/envs/my-env'])
    );
    expect(result).to.be.undefined;
  });

  it('should not hang on a cyclic chain', async () => {
    const result = await findLegacyCoreEnvInChain(
      'my-org/envs/a@1.0.0',
      queriesFrom({
        'my-org/envs/a@1.0.0': 'my-org/envs/b@1.0.0',
        'my-org/envs/b@1.0.0': 'my-org/envs/a@1.0.0',
      })
    );
    expect(result).to.be.undefined;
  });

  it('should give up on a chain longer than the depth bound', async () => {
    // 12 links, all custom, the last one on a legacy core env - past the bound on purpose
    const envOfEnv: Record<string, string> = {};
    for (let i = 0; i < 12; i += 1) {
      envOfEnv[`my-org/envs/env${i}@1.0.0`] = `my-org/envs/env${i + 1}@1.0.0`;
    }
    envOfEnv['my-org/envs/env12@1.0.0'] = 'teambit.harmony/node';
    const result = await findLegacyCoreEnvInChain('my-org/envs/env0@1.0.0', queriesFrom(envOfEnv));
    expect(result).to.be.undefined;
  });

  it('should return undefined when the env of an env cannot be determined', async () => {
    const result = await findLegacyCoreEnvInChain('my-org/envs/my-env@0.0.9', queriesFrom({}));
    expect(result).to.be.undefined;
  });
});
