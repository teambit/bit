import chai, { expect } from 'chai';
import path from 'path';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('merge lanes conflicts', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('conflict when the same file exist in base, deleted on the lane and modified on main', () => {
    const conflictedFilePath = 'comp1/foo.js';
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);

      helper.fs.outputFile(conflictedFilePath);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.command.createLane();
      helper.fs.deletePath(conflictedFilePath);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.command.switchLocalLane('main', '-x');
      helper.fs.outputFile(conflictedFilePath, 'console.log("hello")');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      beforeMerge = helper.scopeHelper.cloneWorkspace();
    });
    describe('when the lane is merged to main, so currently on the FS the file exits', () => {
      before(() => {
        helper.command.mergeLane('dev', '--no-squash --no-auto-snap -x');
      });
      // previously the file was removed
      it('should not remove the file', () => {
        expect(path.join(helper.scopes.localPath, conflictedFilePath)).to.be.a.file();
      });
    });
    describe('when main is merged to the lane, so currently on the FS the file is removed', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        helper.command.switchLocalLane('dev', '-x');
        helper.command.mergeLane('main', '--no-auto-snap -x');
      });
      // previously it was in "remain-deleted" state and the file was not created
      it('should add the file', () => {
        expect(path.join(helper.scopes.localPath, conflictedFilePath)).to.be.a.file();
      });
    });
  });
  describe('when a file was deleted on the other lane but exist current and on the base', () => {
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      beforeMerge = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main', '-x');
      helper.fs.deletePath('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(beforeMerge);
      helper.command.mergeLane('main', '--auto-merge-resolve ours -x');
    });
    it('should indicate that this file was removed in the output', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents[0].files[0].status).to.equal('D');
    });
    it('should remove this file from the filesystem ', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/foo.js')).to.not.be.a.path();
    });
  });
  describe('when a file was deleted on the other lane but exist current and on the base and both lanes are diverged', () => {
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js', 'original-content');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fs.outputFile('comp1/foo.js', 'lane-content');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      beforeMerge = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main', '-x');
      helper.fs.deletePath('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(beforeMerge);
      helper.command.mergeLane('main', '--auto-merge-resolve ours -x');
    });
    it('should indicate that this file was removed in the output', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents[0].files[0].status).to.equal('D');
    });
    it('should remove this file from the filesystem ', () => {
      expect(path.join(helper.scopes.localPath, 'comp1/foo.js')).to.not.be.a.path();
    });
  });
  describe('naming conflict introduced during the merge', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/foo.js');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fs.deletePath('comp1/foo.js');
      helper.fs.outputFile('comp1/FOO.js'); // same name but different case (foo vs FOO)
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.mergeLane(`${helper.scopes.remote}/dev`, '-x');
    });
    it('should merge without error by prefix "_1" to the dir-name', () => {
      const bitMap = helper.bitMap.read();
      expect(Object.keys(bitMap)[0]).to.have.string('comp1_1');
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
      expect(status.stagedComponents[0].id).to.have.string('comp1_1');
    });
  });
  describe('when a file exists in local and others but not in base', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fs.outputFile('comp1/foo.js', 'lane-content');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.fs.outputFile('comp1/foo.js', 'main-content');
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.switchLocalLane('dev', '-x');
      helper.command.mergeLane('main', '--auto-merge-resolve manual -x');
    });
    it('should write the file with the conflicts', () => {
      const fileContent = helper.fs.readFile('comp1/foo.js');
      expect(fileContent).to.have.string('lane-content');
      expect(fileContent).to.have.string('main-content');
      expect(fileContent).to.have.string('<<<<<<<');
      expect(fileContent).to.have.string('>>>>>>>');
    });
  });
});
