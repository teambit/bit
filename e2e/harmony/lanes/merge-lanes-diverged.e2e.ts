import chai, { expect } from 'chai';
import path from 'path';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('merge lanes diverged', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('getting updates from main when lane is diverge', () => {
    let workspaceOnLane: string;
    let comp2HeadOnMain: string;
    let beforeMerge: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(2, undefined, 'version2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      workspaceOnLane = helper.scopeHelper.cloneWorkspace();
      helper.command.switchLocalLane('main');
      helper.fixtures.populateComponents(2, undefined, 'version3');
      helper.command.snapAllComponentsWithoutBuild();
      comp2HeadOnMain = helper.command.getHead(`${helper.scopes.remote}/comp2`);
      helper.command.export();
      helper.scopeHelper.getClonedWorkspace(workspaceOnLane);
      helper.command.import();
      beforeMerge = helper.scopeHelper.cloneWorkspace();
    });
    it('bit import should not bring the latest main objects', () => {
      const head = helper.command.getHead(`${helper.scopes.remote}/comp2`);
      expect(head).to.not.equal(comp2HeadOnMain);
    });
    it('bit status should indicate that the main is ahead', () => {
      const status = helper.command.status('--lanes');
      expect(status).to.have.string(`${helper.scopes.remote}/comp1 ... main is ahead by 1 snaps`);
    });
    let afterMergeToMain: string;
    describe('merging the lane', () => {
      let status;
      before(() => {
        helper.command.mergeLane('main', '--auto-merge-resolve theirs');
        status = helper.command.statusJson();
        afterMergeToMain = helper.scopeHelper.cloneWorkspace();
      });
      it('bit status should show two staging versions, the merge-snap and the one of the original lane because it is new to this lane', () => {
        const stagedVersions = status.stagedComponents.find((c) => c.id === `${helper.scopes.remote}/comp2`);
        expect(stagedVersions.versions).to.have.lengthOf(2);
        expect(stagedVersions.versions).to.include(helper.command.getHeadOfLane('dev', 'comp2'));
      });
      it('bit status should not show the components in pending-merge', () => {
        expect(status.mergePendingComponents).to.have.lengthOf(0);
      });
      describe('switching to main and merging the lane to main without squash', () => {
        before(() => {
          helper.command.switchLocalLane('main');
          helper.command.mergeLane('dev', '--no-squash');
        });
        it('head should have two parents', () => {
          const cat = helper.command.catComponent('comp1@latest');
          expect(cat.parents).to.have.lengthOf(2);
        });
        // previously it was throwing:
        // removeComponentVersions found multiple parents for a local (un-exported) version 368fb583865af40a8823d2ac1d556f4b65582ba2 of iw4j2eko-remote/comp1
        it('bit reset should not throw', () => {
          expect(() => helper.command.resetAll()).to.not.throw();
        });
      });
      describe('switching to main and merging the lane to main (with squash)', () => {
        let beforeMergeHead: string;
        before(() => {
          helper.scopeHelper.getClonedWorkspace(afterMergeToMain);
          helper.command.switchLocalLane('main');
          beforeMergeHead = helper.command.getHead('comp1');
          helper.command.mergeLane('dev');
        });
        it('head should have one parents, which is the previous main head', () => {
          const cat = helper.command.catComponent('comp1@latest');
          expect(cat.parents).to.have.lengthOf(1);
          expect(cat.parents[0]).to.equal(beforeMergeHead);
        });
      });
    });
    describe('merge the lane without snapping', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(beforeMerge);
        helper.command.mergeLane('main', '--auto-merge-resolve theirs --no-auto-snap -x');
      });
      it('should show the during-merge as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(2);
      });
      it('bit diff should show the diff between the .bitmap version and the currently merged version', () => {
        const diff = helper.command.diff();
        expect(diff).to.have.string('-module.exports = () => `comp1version2 and ${comp2()}`;'); // eslint-disable-line no-template-curly-in-string
        expect(diff).to.have.string('+module.exports = () => `comp1version3 and ${comp2()}`;'); // eslint-disable-line no-template-curly-in-string
      });
    });
  });
  describe('getting new files when lane is diverge from another lane', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('lane-a');
      helper.fixtures.populateComponents(1, false, 'version2');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();
      helper.command.createLane('lane-b');
      helper.fixtures.populateComponents(1, false, 'version3');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();
      helper.command.switchLocalLane('lane-a');
      helper.fs.outputFile('comp1/new-file.ts');
      helper.command.snapComponentWithoutBuild('comp1');
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('lane-b');
      helper.command.mergeLane(`${helper.scopes.remote}/lane-a`);
    });
    it('should add the newly added file', () => {
      expect(path.join(helper.scopes.localPath, helper.scopes.remote, 'comp1/new-file.ts')).to.be.a.file();
    });
  });
  describe('merge file changes from one lane to another', () => {
    let authorScope;
    let appOutputV2: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      authorScope = helper.scopeHelper.cloneWorkspace();
      helper.command.createLane('dev2');
      appOutputV2 = helper.fixtures.populateComponents(undefined, undefined, ' v2');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();

      helper.scopeHelper.getClonedWorkspace(authorScope);
      helper.command.mergeLane(`${helper.scopes.remote}/dev2`);
      helper.command.compile();
    });
    it('should save the latest versions from that lane into the local lane', () => {
      helper.fs.outputFile('app.js', fixtures.appPrintComp1(helper.scopes.remote));
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal(appOutputV2);
    });
  });
});
