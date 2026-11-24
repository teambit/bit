import { expect } from 'chai';
import { getLocalConfigKeysToRemove, isAspectInLocalConfig } from './local-config-merge';

describe('local-config-merge', () => {
  const localConfigWithEnv = {
    'teambit.envs/envs': { env: 'my-org.my-scope/my-env' },
    'my-org.my-scope/my-env@1.0.0': {},
    'teambit.dependencies/dependency-resolver': { policy: { dependencies: { lodash: '4.17.21' } } },
  };
  describe('isAspectInLocalConfig', () => {
    it('should ignore versions when comparing aspect ids', () => {
      expect(isAspectInLocalConfig('my-org.my-scope/my-env@2.0.0', localConfigWithEnv)).to.be.true;
      expect(isAspectInLocalConfig('my-org.my-scope/my-env', localConfigWithEnv)).to.be.true;
    });
    it('should return false for an aspect that is not set locally', () => {
      expect(isAspectInLocalConfig('teambit.pkg/pkg', localConfigWithEnv)).to.be.false;
    });
  });
  describe('getLocalConfigKeysToRemove', () => {
    it('should remove both env keys when "teambit.envs/envs" is conflicted', () => {
      expect(getLocalConfigKeysToRemove(localConfigWithEnv, ['teambit.envs/envs'])).to.have.members([
        'teambit.envs/envs',
        'my-org.my-scope/my-env@1.0.0',
      ]);
    });
    it('should remove only the conflicted aspect, regardless of its version', () => {
      const localConfig = { 'my-org.my-scope/my-aspect@0.0.1': { foo: 'bar' }, 'teambit.pkg/pkg': {} };
      expect(getLocalConfigKeysToRemove(localConfig, ['my-org.my-scope/my-aspect@0.0.2'])).to.deep.equal([
        'my-org.my-scope/my-aspect@0.0.1',
      ]);
    });
    it('should not remove anything when there are no conflicts', () => {
      expect(getLocalConfigKeysToRemove(localConfigWithEnv, [])).to.deep.equal([]);
    });
  });
});
