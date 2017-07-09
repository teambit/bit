import { expect } from 'chai';
import sinon from 'sinon';
import exportAction from '../../../../src/api/consumer/lib/export';
import { ComponentNotFound } from '../../../../src/scope/exceptions';
import ExportWithoutThis from '../../../../src/api/consumer/lib/exceptions/export-without-this';
import * as consumer from '../../../../src/consumer';

describe('export', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.sandbox.create();
  });
  afterEach(() => {
    sandbox.restore();
  });
  it('should throw a ComponentNotFound error if the component-id does include "@this" annotation', () => {
    sandbox.stub(consumer, 'loadConsumer').returns(Promise.resolve({ exportAction: () => Promise.reject(new ComponentNotFound()) }));
    const result = exportAction('@this/box/name', 'my.remote');
    return result.catch((err) => {
      expect(err).to.be.an.instanceof(ComponentNotFound);
    });
  });
});
