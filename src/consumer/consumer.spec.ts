import { expect } from 'chai';
import sinon from 'sinon';
import { BitIds } from '../bit-id';

import Consumer from '../consumer/consumer';
import { MissingBitMapComponent } from './bit-map/exceptions';

describe('Consumer', function () {
  this.timeout(0);
  let sandbox;
  const getConsumerInstance = () => {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const consumer = new Consumer({
      projectPath: '',
      // @ts-ignore
      config: {},
      // @ts-ignore
      scope: { getPath: () => '', lanes: { getCurrentLaneName: () => '' } },
    });
    // @ts-ignore
    consumer.bitMap = {
      getAllBitIdsFromAllLanes: () => new BitIds(),
    };
    return consumer;
  };
  describe('getComponentIdFromNodeModulesPath', () => {
    let consumer;
    before(() => {
      sandbox = sinon.createSandbox();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      consumer = getConsumerInstance(sandbox);
    });
    after(() => {
      sandbox.restore();
    });
    it('should parse the path correctly when a component is not in bitMap and has one dot', () => {
      const result = consumer.getComponentIdFromNodeModulesPath(
        '../../../node_modules/@bit/q207wrk9-remote.comp/file2.js',
        '@bit'
      );
      expect(result.scope).to.equal('q207wrk9-remote');
      expect(result.name).to.equal('comp');
    });
    it('should parse the path correctly when a component is not in bitMap and has two dots', () => {
      const result = consumer.getComponentIdFromNodeModulesPath(
        '../../../node_modules/@bit/q207wrk9-remote.comp.comp2/file2.js',
        '@bit'
      );
      expect(result.scope).to.equal('q207wrk9-remote.comp');
      expect(result.name).to.equal('comp2');
    });
    it('should parse the path correctly when a component is not in bitMap and has three dots', () => {
      const result = consumer.getComponentIdFromNodeModulesPath(
        '../../../node_modules/@bit/q207wrk9-remote.comp.comp2.comp3/file2.js',
        '@bit'
      );
      expect(result.scope).to.equal('q207wrk9-remote.comp');
      expect(result.name).to.equal('comp2/comp3');
    });
  });
  describe('getParsedIdIfExist', () => {
    let consumer;
    before(() => {
      sandbox = sinon.createSandbox();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      consumer = getConsumerInstance(sandbox);
    });
    after(() => {
      sandbox.restore();
    });
    it('should throw an error for a missing component', () => {
      const func = () => consumer.getParsedIdIfExist('non-exist-comp');
      expect(func).to.not.throw(MissingBitMapComponent);
    });
  });
});
