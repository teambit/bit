import { expect } from 'chai';
import ComponentsOverrides from './components-overrides';
import BitId from '../../bit-id/bit-id';

describe('componentsOverrides', () => {
  describe('getOverrideComponentData', () => {
    it('should get env results from the more generic wildcard overrides by the exact match', () => {
      const overridesFixture = {
        'src/*': { env: { compiler: 'bit.envs/compiler/babel@7.0.0', tester: 'bit.envs/tester/jest@0.0.1' } },
        'src/utils/javascript/is-string': { env: { compiler: 'bit.envs/compiler/babel@0.0.20' } }
      };
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
    it('should get env results from the more generic wildcard overrides by the more specific one', () => {
      const overridesFixture = {
        'src/*': { env: { compiler: 'bit.envs/compiler/babel@7.0.0', tester: 'bit.envs/tester/jest@0.0.1' } },
        'src/utils/javascript/*': {},
        'src/utils/*': { env: { compiler: 'bit.envs/compiler/babel@0.0.20' } },
        'utils/*': { env: { compiler: 'bit.envs/compiler/somethingelse@0.0.20' } }
      };
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
    it('should get dependencies results from the more generic wildcard overrides by the more specific one', () => {
      const overridesFixture = {
        'src/*': { dependencies: { foo: '0.0.1', bar: '0.0.1' } },
        'src/utils/javascript/*': { dependencies: { baz: '0.0.1' } },
        'src/utils/*': { dependencies: { foo: '0.0.1' } },
        'src/utils/javascript/is-string': { dependencies: { foo: '0.0.5' } },
        'utils/*': { dependencies: { 'something/else': '0.0.1' } }
      };
      const componentsOverrides = new ComponentsOverrides(overridesFixture);
      const id = new BitId({ name: 'src/utils/javascript/is-string' });
      const result = componentsOverrides.getOverrideComponentData(id);
      expect(result)
        .to.have.property('dependencies')
        .that.deep.equal({
          foo: '0.0.5',
          bar: '0.0.1',
          baz: '0.0.1'
        });
    });
  });
});
