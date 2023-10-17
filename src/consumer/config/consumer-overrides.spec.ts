import { expect } from 'chai';
import { ComponentID } from '@teambit/component-id';
import ConsumerOverrides from './consumer-overrides';

describe('ConsumerOverrides', () => {
  describe('getOverrideComponentData()', () => {
    describe('when propagation set to false', () => {
      it('should use only the most specific match', () => {
        const overridesFixture = {
          'my-scope/src/*': { dependencies: { scope: 'my-scope', foo: '0.0.1', bar: '0.0.1' } },
          'my-scope/src/utils/javascript/*': { dependencies: { scope: 'my-scope', baz: '0.0.1' } },
          'my-scope/src/utils/*': { dependencies: { scope: 'my-scope', foo: '0.0.1' } },
          'my-scope/src/utils/javascript/is-string': {
            propagate: false,
            dependencies: { scope: 'my-scope', foo: '0.0.5' },
          },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = ComponentID.fromObject({ scope: 'my-scope', name: 'src/utils/javascript/is-string' });
        const result = componentsOverrides.getOverrideComponentData(id);
        expect(result).to.have.property('dependencies').that.deep.equal({
          scope: 'my-scope',
          foo: '0.0.5',
        });
      });
    });
    describe('when propagation set to true', () => {
      it('should get env results from the more generic wildcard overrides by the exact match', () => {
        const overridesFixture = {
          'my-scope/src/*': {
            env: { compiler: 'bit.envs/compiler/babel@7.0.0', tester: 'bit.envs/tester/jest@0.0.1' },
          },
          'my-scope/src/utils/javascript/is-string': {
            propagate: true,
            env: { compiler: 'bit.envs/compiler/babel@0.0.20' },
          },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = ComponentID.fromObject({ scope: 'my-scope', name: 'src/utils/javascript/is-string' });
        const result = componentsOverrides.getOverrideComponentData(id);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('compiler').that.equal('bit.envs/compiler/babel@0.0.20');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('tester').that.equal('bit.envs/tester/jest@0.0.1');
      });
      it('should get env results from the more generic wildcard overrides by the more specific one', () => {
        const overridesFixture = {
          'my-scope/src/*': {
            propagate: true,
            env: { compiler: 'bit.envs/compiler/babel@7.0.0', tester: 'bit.envs/tester/jest@0.0.1' },
          },
          'my-scope/src/utils/javascript/*': { propagate: true },
          'my-scope/src/utils/*': { propagate: true, env: { compiler: 'bit.envs/compiler/babel@0.0.20' } },
          'my-scope/utils/*': { propagate: true, env: { compiler: 'bit.envs/compiler/somethingelse@0.0.20' } },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = ComponentID.fromObject({ scope: 'my-scope', name: 'src/utils/javascript/is-string' });
        const result = componentsOverrides.getOverrideComponentData(id);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('compiler').that.equal('bit.envs/compiler/babel@0.0.20');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(result.env).to.have.property('tester').that.equal('bit.envs/tester/jest@0.0.1');
      });
      it('should get dependencies results from the more generic wildcard overrides by the more specific one', () => {
        const overridesFixture = {
          'my-scope/src/*': { propagate: true, dependencies: { foo: '0.0.1', bar: '0.0.1' } },
          'my-scope/src/utils/javascript/*': { propagate: true, dependencies: { baz: '0.0.1' } },
          'my-scope/src/utils/*': { propagate: true, dependencies: { foo: '0.0.1' } },
          'my-scope/src/utils/javascript/is-string': { propagate: true, dependencies: { foo: '0.0.5' } },
          'my-scope/utils/*': { propagate: true, dependencies: { 'something/else': '0.0.1' } },
        };
        const componentsOverrides = new ConsumerOverrides(overridesFixture);
        const id = ComponentID.fromObject({ scope: 'my-scope', name: 'src/utils/javascript/is-string' });
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
