import { expect } from 'chai';
import sinon from 'sinon';
import listScope from '../../../../src/api/consumer/lib/list-scope';
import { ConsumerNotFound } from '../../../../src/consumer/exceptions';
import * as consumer from '../../../../src/consumer';
import { GlobalRemotes } from '../../../../src/global-config';
import Remotes from '../../../../src/remotes/remotes';

describe('ListScope', () => {
  let sandbox;
  before(() => {
    sandbox = sinon.sandbox.create();
  });
  after(() => {
    sandbox.restore();
  });
  describe('list', () => {
    it('should list components outside a scope if scopeName is given', () => {
      sandbox.stub(consumer, 'loadConsumer').returns(Promise.reject(new ConsumerNotFound()));
      sandbox.stub(GlobalRemotes, 'load').returns(Promise.resolve({ toPlainObject: () => {} }));
      const listSpy = sandbox.spy();
      const resolveStub = sandbox.stub(Remotes.prototype, 'resolve').returns(Promise.resolve({ list: listSpy }));

      const result = listScope({ scopeName: 'non-exists-scope' });
      expect(result).to.be.a('Promise');

      return result.then(() => {
        expect(resolveStub.getCall(0).args[0]).to.equal('non-exists-scope');
        expect(listSpy.called).to.be.true;
      });
    }).timeout(5000);
  });
});
