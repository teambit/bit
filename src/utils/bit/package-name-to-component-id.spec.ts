import { expect } from 'chai';
import { packageNameToComponentId } from './package-name-to-component-id';
import { Consumer } from '../../consumer';
import { BitIds, BitId } from '../../bit-id';

describe('packageNameToComponentId', function() {
  this.timeout(0);
  let consumer: Consumer;
  before(() => {
    // @ts-ignore
    consumer = new Consumer({ projectPath: '', config: {} });
  });
  it('should parse the path correctly when a component is not in bitMap and has one dot', () => {
    const result = packageNameToComponentId(consumer, '@bit/remote.comp', '@bit');
    expect(result.scope).to.equal('remote');
    expect(result.name).to.equal('comp');
  });
  it('should parse the path correctly when a component is not in bitMap and has two dots', () => {
    const result = packageNameToComponentId(consumer, '@bit/remote.comp.comp2', '@bit');
    expect(result.scope).to.equal('remote.comp');
    expect(result.name).to.equal('comp2');
  });
  it('should parse the path correctly when a component is not in bitMap and has three dots', () => {
    const result = packageNameToComponentId(consumer, '@bit/remote.comp.comp2.comp3', '@bit');
    expect(result.scope).to.equal('remote.comp');
    expect(result.name).to.equal('comp2/comp3');
  });
  describe('with defaultScope', () => {
    describe('when the defaultScope has dot', () => {
      it('should return bitId without scope when the component is in .bitmap without scope', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIds: () => new BitIds(new BitId({ name: 'bar/foo' })) };
        consumer.config.defaultScope = 'bit.utils';
        const result = packageNameToComponentId(consumer, '@bit/bit.utils.bar.foo', '@bit');
        expect(result.scope).to.be.null;
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is in .bitmap with scope', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIds: () => new BitIds(new BitId({ scope: 'bit.utils', name: 'bar/foo' })) };
        consumer.config.defaultScope = 'bit.utils';
        const result = packageNameToComponentId(consumer, '@bit/bit.utils.bar.foo', '@bit');
        expect(result.scope).to.equal('bit.utils');
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is not .bitmap at all', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIds: () => new BitIds() };
        consumer.config.defaultScope = 'bit.utils';
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
        consumer.bitMap = { getAllBitIds: () => new BitIds(new BitId({ name: 'bar/foo' })) };
        const result = packageNameToComponentId(consumer, '@bit/utils.bar.foo', '@bit');
        expect(result.scope).to.be.null;
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is in .bitmap with scope', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIds: () => new BitIds(new BitId({ scope: 'utils', name: 'bar/foo' })) };
        const result = packageNameToComponentId(consumer, '@bit/utils.bar.foo', '@bit');
        expect(result.scope).to.equal('utils');
        expect(result.name).to.equal('bar/foo');
      });
      it('should return bitId with scope when the component is not .bitmap at all', () => {
        // @ts-ignore
        consumer.bitMap = { getAllBitIds: () => new BitIds() };
        const result = packageNameToComponentId(consumer, '@bit/utils.bar.foo', '@bit');
        // looks weird, but the default is a dot in the scope.
        expect(result.scope).to.equal('utils.bar');
        expect(result.name).to.equal('foo');
      });
    });
  });
});
