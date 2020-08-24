import { expect } from 'chai';

import BitId from '../../bit-id/bit-id';
import ConsumerOverrides from './consumer-overrides';

describe('ConsumerOverrides', () => {
  describe('getOverrideComponentData()', () => {
    describe('when propagation set to false', () => {
      it('should use only the most specific match', () => {
        const overridesFixture = {
          'src/*': { dependencies: { foo: '0.0.1', bar: '0.0.1' } },
          'src/utils/javascript/*': { dependencies: { baz: '0.0.1' } },
          'src/utils/*': { dependencies: { foo: '0.0.1' } },
          'src/utils/javascript/is-string': { propagate: false, dependencies: { foo: '0.0.5' } },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = new BitId({ name: 'src/utils/javascript/is-string' });
        const result = componentsOverrides.getOverrideComponentData(id);
        expect(result).to.have.property('dependencies').that.deep.equal({
          foo: '0.0.5',
        });
      });
    });
    describe('when propagation set to true', () => {
      it('should get env results from the more generic wildcard overrides by the exact match', () => {
        const overridesFixture = {
          'src/*': { env: { compiler: 'bit.envs/compiler/babel@7.0.0', tester: 'bit.envs/tester/jest@0.0.1' } },
          'src/utils/javascript/is-string': { propagate: true, env: { compiler: 'bit.envs/compiler/babel@0.0.20' } },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = new BitId({ name: 'src/utils/javascript/is-string' });
        const result = componentsOverrides.getOverrideComponentData(id);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('compiler').that.equal('bit.envs/compiler/babel@0.0.20');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('tester').that.equal('bit.envs/tester/jest@0.0.1');
      });
      it('should get env results from the more generic wildcard overrides by the more specific one', () => {
        const overridesFixture = {
          'src/*': {
            propagate: true,
            env: { compiler: 'bit.envs/compiler/babel@7.0.0', tester: 'bit.envs/tester/jest@0.0.1' },
          },
          'src/utils/javascript/*': { propagate: true },
          'src/utils/*': { propagate: true, env: { compiler: 'bit.envs/compiler/babel@0.0.20' } },
          'utils/*': { propagate: true, env: { compiler: 'bit.envs/compiler/somethingelse@0.0.20' } },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = new BitId({ name: 'src/utils/javascript/is-string' });
        const result = componentsOverrides.getOverrideComponentData(id);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('compiler').that.equal('bit.envs/compiler/babel@0.0.20');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('tester').that.equal('bit.envs/tester/jest@0.0.1');
      });
      it('should get dependencies results from the more generic wildcard overrides by the more specific one', () => {
        const overridesFixture = {
          'src/*': { propagate: true, dependencies: { foo: '0.0.1', bar: '0.0.1' } },
          'src/utils/javascript/*': { propagate: true, dependencies: { baz: '0.0.1' } },
          'src/utils/*': { propagate: true, dependencies: { foo: '0.0.1' } },
          'src/utils/javascript/is-string': { propagate: true, dependencies: { foo: '0.0.5' } },
          'utils/*': { propagate: true, dependencies: { 'something/else': '0.0.1' } },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = new BitId({ name: 'src/utils/javascript/is-string' });
        const result = componentsOverrides.getOverrideComponentData(id);
        expect(result).to.have.property('dependencies').that.deep.equal({
          foo: '0.0.5',
          bar: '0.0.1',
          baz: '0.0.1',
        });
      });
    });
  });
  describe('sortWildcards', () => {
    it('more namespaces should be first', () => {
      const arr = ['bar/*', 'bar/foo/baz/*', 'bar/foo/*'];
      arr.sort(ConsumerOverrides.sortWildcards);
      expect(arr).to.deep.equal(['bar/foo/baz/*', 'bar/foo/*', 'bar/*']);
    });
    it('less wildcards should be first', () => {
      const arr = ['bar/foo/baz/*', 'bar/*/*/*', 'bar/foo/*/*'];
      arr.sort(ConsumerOverrides.sortWildcards);
      expect(arr).to.deep.equal(['bar/foo/baz/*', 'bar/foo/*/*', 'bar/*/*/*']);
    });
    it('wildcards located most left should be first', () => {
      const arr = ['foo/*', '*/foo'];
      arr.sort(ConsumerOverrides.sortWildcards);
      expect(arr).to.deep.equal(['*/foo', 'foo/*']);
    });
  });
});
