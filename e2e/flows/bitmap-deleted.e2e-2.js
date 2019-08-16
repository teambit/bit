import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import ObjectsWithoutConsumer from '../../src/api/consumer/lib/exceptions/objects-without-consumer';

chai.use(require('chai-fs'));

describe('user deleted only .bitmap file leaving the objects in place', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('tagging a component, then, deleting .bitmap file', () => {
    let scopeAfterDeletion;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.bitMap.delete();
      scopeAfterDeletion = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit init', () => {
      it('should throw an error', () => {
        const error = new ObjectsWithoutConsumer(path.join(helper.scopes.localPath, '.bit'));
        const initCmd = () => helper.scopeHelper.initWorkspace();
        helper.general.expectToThrow(initCmd, error);
      });
    });
    describe('bit init --force', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterDeletion);
      });
      it('should init successfully', () => {
        const output = helper.command.runCmd('bit init --force');
        expect(output).to.have.string('successfully initialized');
      });
    });
  });
});
