import { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit search', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe.skip('in a local scope', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
    });
    it('should find the component in the local scope', () => {
      const output = helper.searchComponent('foo');
      expect(output).to.have.string('bar/foo');
    });
  });
  describe.skip('in a remote scope', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportAllComponents();
    });
    it('should find the component in the remote scope', () => {
      const output = helper.searchComponent(`bar -s ${helper.remoteScope}`);
      expect(output).to.have.string('bar/foo');
    });
  });
  describe.skip('in the hub', () => {
    it('should find the flow compiler', () => {
      const output = helper.searchComponent('flow -s bit.envs');
      expect(output).to.have.string('compilers/flow');
    });
  });
  describe.skip('with local scope and corrupted bit.json', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
    });
    it('Should not search component if bit.json is corrupted', () => {
      helper.corruptBitJson();
      try {
        helper.searchComponent('bar/foo');
      } catch (err) {
        output = err.toString();
      }
      expect(output).to.include('error: invalid bit.json: ');
      expect(output).to.include(`${path.join(helper.localScopePath, 'bit.json')}`);
    });
  });
});
