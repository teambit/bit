import { expect } from 'chai';

import { BitId, BitIds } from '../../bit-id';
import { Consumer } from '../../consumer';
import { packageNameToComponentId } from './package-name-to-component-id';

describe('packageNameToComponentId', function () {
  this.timeout(0);
  let consumer: Consumer;
  before(() => {
    // @ts-ignore
    consumer = new Consumer({
      projectPath: '',
      // @ts-ignore
      config: {},
      // @ts-ignore
      scope: { getPath: () => '', lanes: { getCurrentLaneName: () => '' } },
    });
  });
  describe('when a packageName has no dots', () => {
    it('should return bitId with no-scope when it is on bitmap', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ name: 'foo' })) };
      const result = packageNameToComponentId(consumer, '@bit/foo', '@bit');
      expect(result.scope).to.be.null;
      expect(result.name).to.equal('foo');
    });
    it('should throw when is not on bitmap', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
      const func = () => packageNameToComponentId(consumer, '@bit/foo', '@bit');
      expect(func).to.throw();
    });
  });
  describe('when a packageName has one dot', () => {
    it('should return bitId with no-scope when it is on bitmap this way', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ name: 'bar/foo' })) };
      const result = packageNameToComponentId(consumer, '@bit/bar.foo', '@bit');
      expect(result.scope).to.be.null;
      expect(result.name).to.equal('bar/foo');
    });
    it('should return bitId with scope and name when it is on bitmap this way', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ scope: 'bar', name: 'foo' })) };
      const result = packageNameToComponentId(consumer, '@bit/bar.foo', '@bit');
      expect(result.scope).to.equal('bar');
      expect(result.name).to.equal('foo');
    });
    it('should return bitId with scope and name when it is not on bitmap as it cannot be new component', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
      const result = packageNameToComponentId(consumer, '@bit/bar.foo', '@bit');
      expect(result.scope).to.equal('bar');
      expect(result.name).to.equal('foo');
    });
  });
  describe('when a packageName has two dots', () => {
    it('should return bitId with no-scope when it is on bitmap this way', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ name: 'foo/bar/qux' })) };
      const result = packageNameToComponentId(consumer, '@bit/foo.bar.qux', '@bit');
      expect(result.scope).to.be.null;
      expect(result.name).to.equal('foo/bar/qux');
    });
    it('should return bitId with scope without dot and name when it is on bitmap this way', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ scope: 'foo', name: 'bar/qux' })) };
      const result = packageNameToComponentId(consumer, '@bit/foo.bar.qux', '@bit');
      expect(result.scope).to.equal('foo');
      expect(result.name).to.equal('bar/qux');
    });
    it('should return bitId with scope with dot and name when it is on bitmap this way', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ scope: 'foo.bar', name: 'qux' })) };
      const result = packageNameToComponentId(consumer, '@bit/foo.bar.qux', '@bit');
      expect(result.scope).to.equal('foo.bar');
      expect(result.name).to.equal('qux');
    });
    it('should return bitId with scope with dot and name when it is not on bitmap', () => {
      // @ts-ignore
      consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
      const result = packageNameToComponentId(consumer, '@bit/foo.bar.qux', '@bit');
      expect(result.scope).to.equal('foo.bar');
      expect(result.name).to.equal('qux');
    });
  });
  it('should parse the path correctly when a component is not in bitMap and has one dot', () => {
    // @ts-ignore
    consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
    const result = packageNameToComponentId(consumer, '@bit/remote.comp', '@bit');
    expect(result.scope).to.equal('remote');
    expect(result.name).to.equal('comp');
  });
  it('should parse the path correctly when a component is not in bitMap and has two dots', () => {
    // @ts-ignore
    consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
    const result = packageNameToComponentId(consumer, '@bit/remote.comp.comp2', '@bit');
    expect(result.scope).to.equal('remote.comp');
    expect(result.name).to.equal('comp2');
  });
  it('should parse the path correctly when a component is not in bitMap and has three dots', () => {
    // @ts-ignore
    consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
    const result = packageNameToComponentId(consumer, '@bit/remote.comp.comp2.comp3', '@bit');
    expect(result.scope).to.equal('remote.comp');
    expect(result.name).to.equal('comp2/comp3');
  });
  describe('with defaultScope', () => {
    // @ts-ignore
    const addDefaultScope = (defaultScope: string) => (consumer.config = { workspaceSettings: { defaultScope } });
    describe('when the defaultScope has dot', () => {
      it('should return bitId without scope when the component is in .bitmap without scope', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ name: 'bar/foo' })) };
        addDefaultScope('bit.utils');
        consumer.config.defaultScope = 'bit.utils';
        const result = packageNameToComponentId(consumer, '@bit/bit.utils.bar.foo', '@bit');
        expect(result.scope).to.be.null;
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is in .bitmap with scope', () => {
        // @ts-ignore
        consumer.bitMap = {
          getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ scope: 'bit.utils', name: 'bar/foo' })),
        };
        addDefaultScope('bit.utils');
        const result = packageNameToComponentId(consumer, '@bit/bit.utils.bar.foo', '@bit');
        expect(result.scope).to.equal('bit.utils');
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is not .bitmap at all', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
        addDefaultScope('bit.utils');
        const result = packageNameToComponentId(consumer, '@bit/bit.utils.bar.foo', '@bit');
        expect(result.scope).to.equal('bit.utils');
        expect(result.name).to.equal('bar/foo');
      });
    });
    describe('when the defaultScope does not have dot', () => {
      before(() => {
        consumer.config.defaultScope = 'utils';
      });
      it('should return bitId without scope when the component is in .bitmap without scope', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ name: 'bar/foo' })) };
        const result = packageNameToComponentId(consumer, '@bit/utils.bar.foo', '@bit');
        expect(result.scope).to.be.null;
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is in .bitmap with scope', () => {
        // @ts-ignore
        consumer.bitMap = {
          getAllBitIdsFromAllLanes: () => new BitIds(new BitId({ scope: 'utils', name: 'bar/foo' })),
        };
        const result = packageNameToComponentId(consumer, '@bit/utils.bar.foo', '@bit');
        expect(result.scope).to.equal('utils');
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is not .bitmap at all', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIdsFromAllLanes: () => new BitIds() };
        const result = packageNameToComponentId(consumer, '@bit/utils.bar.foo', '@bit');
        // looks weird, but the default is a dot in the scope.
        expect(result.scope).to.equal('utils.bar');
        expect(result.name).to.equal('foo');
      });
    });
  });
});
