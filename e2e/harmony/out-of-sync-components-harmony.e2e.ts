import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('components that are not synced between the scope and the consumer', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('consumer with a new component and scope with the same component as exported with defaultScope configured', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      const bitMap = helper.bitMap.read();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // the mimic and import here is to make sure the local doesn't have the symlink object
      helper.git.mimicGitCloneLocalProjectHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importAllComponents();
      helper.bitMap.write(bitMap);
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit tag', () => {
      it('should tag the component to the next version of what the scope has', () => {
        const output = helper.command.runCmd('bit tag bar/foo --force --patch');
        expect(output).to.have.string('0.0.2');
      });
    });
    describe('bit status', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        helper.command.status();
      });
      it('should sync .bitmap according to the scope', () => {
        helper.command.expectStatusToBeClean();
        helper.bitMap.expectToHaveIdHarmony('bar/foo', '0.0.1', helper.scopes.remote);
      });
    });
  });
  describe('consumer with a tagged component and scope with no components', () => {
    let scopeOutOfSync;
    before(() => {
      helper.scopeHelper.reInitLocalScopeWithDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllWithoutBuild();
      helper.fs.deletePath('.bit');
      scopeOutOfSync = helper.scopeHelper.cloneLocalScope();
    });
    describe('bit build', () => {
      it('should build the component successfully', () => {
        expect(() => helper.command.build()).to.not.throw();
      });
    });
    describe('bit status', () => {
      let output;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        output = helper.command.status();
      });
      it('should show the component as new', () => {
        expect(output).to.have.string('new components');
        const bitMap = helper.bitMap.read();
        const newId = 'bar/foo';
        expect(bitMap).to.have.property(newId);
        const oldId = 'bar/foo@0.0.1';
        expect(bitMap).to.not.have.property(oldId);
      });
    });
    describe('bit show', () => {
      it('should not show the component with the version', () => {
        helper.scopeHelper.getClonedLocalScope(scopeOutOfSync);
        const show = helper.command.showComponent('bar/foo');
        expect(show).to.not.have.string('0.0.1');
      });
    });
  });
});
