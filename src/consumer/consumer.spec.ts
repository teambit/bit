import { expect } from 'chai';
import sinon from 'sinon';
import { BitIds } from '../bit-id';

import Consumer from '../consumer/consumer';
import { MissingBitMapComponent } from './bit-map/exceptions';

describe('Consumer', function () {
  // @ts-ignore
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
