import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit search', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  // todo: for some reason, this doesn't work when installing bit using yarn, other search (scope/hub) do work
  describe.skip('in a local scope', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
    });
    it('should find the component in the local scope', () => {
      const output = helper.searchComponent('foo');
      expect(output).to.have.string('bar/foo');
    });
  });
  describe('in a remote scope', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportAllComponents();
    });
    it('should find the component in the remote scope', () => {
      const output = helper.searchComponent(`bar -s ${helper.remoteScope}`);
      expect(output).to.have.string('bar/foo');
    });
  });
  describe('in the hub', () => {
    it('should find the flow compiler', () => {
      const output = helper.searchComponent('flow -s bit.envs');
      expect(output).to.have.string('compilers/flow');
    });
  });
});
