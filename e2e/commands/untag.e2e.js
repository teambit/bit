import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../e2e-helper';

describe('bit untag command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    // helper.destroyEnv();
  });
  describe('local single component', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      const output = helper.listLocalScope();
      expect(output).to.have.string('found 1 components');
    });
    describe('with one version', () => {
      before(() => {
        helper.runCmd('bit untag bar/foo 0.0.1');
      });
      it.only('should delete the entire component from the model', () => {
        const output = helper.listLocalScope();
        expect(output).to.have.string('found 0 components');
      });
    });
    // describe('with multiple versions', () => {
    //   it('should revert the tag', () => {
    //
    //   });
    // });
  });
});
