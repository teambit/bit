import chai, { expect } from 'chai';
import * as path from 'path';

import { ObjectsWithoutConsumer } from '@teambit/host-initializer';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('user deleted only .bitmap file leaving the objects in place', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('tagging a component, then, deleting .bitmap file', () => {
    let scopeAfterDeletion;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.bitMap.delete();
      scopeAfterDeletion = helper.scopeHelper.cloneWorkspace();
    });
    describe('bit init', () => {
      it('should throw an error', () => {
        const error = new ObjectsWithoutConsumer(path.join(helper.scopes.localPath, '.bit'));
        const initCmd = () => helper.command.init();
        helper.general.expectToThrow(initCmd, error);
      });
    });
    describe('bit init --force', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeAfterDeletion);
      });
      it('should init successfully', () => {
        const output = helper.command.runCmd('bit init --force');
        expect(output).to.have.string('successfully');
      });
    });
  });
});
