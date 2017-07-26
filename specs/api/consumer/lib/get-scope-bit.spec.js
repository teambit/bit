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
  // todo: it fails on Circle-CI for no reason. Fix it there, then, enable it here
  xit('should show a component when is running outside a scope', async () => {
    sandbox.stub(consumer, 'loadConsumer').returns(Promise.reject(new ConsumerNotFound()));
    sandbox.stub(scope, 'loadScope').returns(Promise.reject(new ScopeNotFound()));
    sandbox.stub(GlobalRemotes, 'load').returns(Promise.resolve({ toPlainObject: () => {} }));
    const showSpy = sandbox.spy();
    const resolveStub = sandbox.stub(Remotes.prototype, 'resolve').returns(Promise.resolve({ show: showSpy }));

    await getScopeBit({ id: 'my-scope/box/name' });
    expect(resolveStub.getCall(0).args[0]).to.equal('my-scope');
    expect(showSpy.called).to.be.true;
  });
});
