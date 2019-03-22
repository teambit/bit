// @flow
import ComponentsOverrides from './components-overrides';
import BitId from '../../bit-id/bit-id';
import { expect } from 'chai';

describe('componentsOverrides', () => {
  const overridesFixture = {
    'src/*': { env: { compiler: 'bit.envs/compiler/babel@7.0.0', tester: 'bit.envs/tester/jest@0.0.1' } },
    'src/utils/javascript/*': {},
    'src/utils/*': {},
    'src/utils/javascript/is-string': { env: { compiler: 'bit.envs/compiler/babel@0.0.20' } },
    'utils/*': {}
  };
  describe('getOverrideComponentData', () => {
    it('should get results from the more generic wildcard overrides by the more specific one', () => {
      const componentsOverrides = new ComponentsOverrides(overridesFixture);
      const id = new BitId({ name: 'src/utils/javascript/is-string' });
      const result = componentsOverrides.getOverrideComponentData(id);
      expect(result.env)
        .to.have.property('compiler')
        .that.equal('bit.envs/compiler/babel@0.0.20');
      expect(result.env)
        .to.have.property('tester')
        .that.equal('bit.envs/tester/jest@0.0.1');
    });
  });
});
