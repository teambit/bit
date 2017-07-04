import { expect } from 'chai';
import sinon from 'sinon';
import getScopeBit from '../../../../src/api/consumer/lib/get-scope-component';
import { ConsumerNotFound } from '../../../../src/consumer/exceptions';
import { ScopeNotFound } from '../../../../src/scope/exceptions';
import * as consumer from '../../../../src/consumer';
import { GlobalRemotes } from '../../../../src/global-config';
import Remotes from '../../../../src/remotes/remotes';
import * as scope from '../../../../src/scope';

describe('getScopeBit', () => {
  let sandbox;
  before(() => {
    sandbox = sinon.sandbox.create();
  });
  after(() => {
    sandbox.restore();
  });
  it('should show a component when is running outside a scope', () => {
    sandbox.stub(consumer, 'loadConsumer').returns(Promise.reject(new ConsumerNotFound()));
    sandbox.stub(scope, 'loadScope').returns(Promise.reject(new ScopeNotFound()));
    sandbox.stub(GlobalRemotes, 'load').returns(Promise.resolve({ toPlainObject: () => {} }));
    const showSpy = sandbox.spy();
    const resolveStub = sandbox.stub(Remotes.prototype, 'resolve').returns(Promise.resolve({ show: showSpy }));

    const result = getScopeBit({ id: 'my-scope/box/name' });
    expect(result).to.be.a('Promise');

    return result
      .then(() => {
        expect(resolveStub.getCall(0).args[0]).to.equal('my-scope');
        expect(showSpy.called).to.be.true;
      });
  });
});
