import { expect } from 'chai';
import sinon from 'sinon';

import { listScope } from '../../../api/consumer/lib/list-scope';
import * as consumer from '../../../consumer';
import { ConsumerNotFound } from '../../../consumer/exceptions';
import { GlobalRemotes } from '../../../global-config';
import Remotes from '../../../remotes/remotes';

describe('ListScope', () => {
  let sandbox;
  before(() => {
    sandbox = sinon.createSandbox();
  });
  after(() => {
    sandbox.restore();
  });
  // @todo: currently this functionality is not working.
  // the migrate feature needs the consumer to be available and throw an error otherwise.
  describe.skip('list', () => {
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
