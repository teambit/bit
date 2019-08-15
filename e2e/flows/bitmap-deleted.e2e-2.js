import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import ObjectsWithoutConsumer from '../../src/api/consumer/lib/exceptions/objects-without-consumer';

chai.use(require('chai-fs'));

describe('user deleted only .bitmap file leaving the objects in place', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('tagging a component, then, deleting .bitmap file', () => {
    let scopeAfterDeletion;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
      helper.deleteBitMap();
      scopeAfterDeletion = helper.cloneLocalScope();
    });
    describe('bit init', () => {
      it('should throw an error', () => {
        const error = new ObjectsWithoutConsumer(path.join(helper.localScopePath, '.bit'));
        const initCmd = () => helper.initWorkspace();
        helper.expectToThrow(initCmd, error);
      });
    });
    describe('bit init --force', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterDeletion);
      });
      it('should init successfully', () => {
        const output = helper.runCmd('bit init --force');
        expect(output).to.have.string('successfully initialized');
      });
    });
  });
});
