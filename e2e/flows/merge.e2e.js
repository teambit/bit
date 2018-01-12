import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('merge functionality', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('re-exporting an existing version', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      const scopeWithV1 = helper.cloneLocalScope();
      helper.commitComponent('bar/foo', 'msg', '-f');
      helper.exportAllComponents(); // v2 is exported

      helper.getClonedLocalScope(scopeWithV1);
      helper.commitComponent('bar/foo', 'msg', '-f');
      try {
        output = helper.exportAllComponents(); // v2 is exported again
      } catch (e) {
        output = e.message;
      }
    });
    it('should throw merge-conflict error', () => {
      expect(output).to.have.string('Merge conflict occurred when exporting the component');
    });
  });
});
