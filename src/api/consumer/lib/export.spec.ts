import { expect } from 'chai';
import sinon from 'sinon';
import exportAction from '../../../api/consumer/lib/export';
import { ComponentNotFound } from '../../../scope/exceptions';
import * as consumer from '../../../consumer';

describe('export', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  afterEach(() => {
    sandbox.restore();
  });
  xit('should throw a ComponentNotFound error if the component-id does include "@this" annotation', () => {
    sandbox
      .stub(consumer, 'loadConsumer')
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      .returns(Promise.resolve({ exportAction: () => Promise.reject(new ComponentNotFound()) }));
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return exportAction('@this/box/name', 'my.remote')
      .then(() => expect.fail('should not be here'))
      .catch(err => {
        expect(err).to.be.an.instanceof(ComponentNotFound);
      });
  });
});
