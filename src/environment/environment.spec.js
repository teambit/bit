import { expect } from 'chai';
import sinon from 'sinon';
import Environment from '../environment';
import { Scope } from '../scope';

describe('Environment', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });
  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it.skip('should generate a unique path for every instance', () => {
      sandbox.stub(Scope, 'load').returns({ getPath: () => '' });
      const scope = Scope.load();
      const environment1 = new Environment(scope);
      const environment2 = new Environment(scope);
      expect(environment1.path).not.to.be.equal(environment2.path);
    });
  });
});
