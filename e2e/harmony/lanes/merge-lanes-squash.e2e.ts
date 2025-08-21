import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('merge lanes - squash functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('merge with squash', () => {
    let headOnMain: string;
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      headOnMain = helper.command.getHead('comp1');
      helper.command.export();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      // as an intermediate step, verify that it has 4 snaps.
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(4);

      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev');
    });
    it('should squash the snaps and leave only the last one', () => {
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(2);

      expect(log[0].hash).to.equal(headOnMain);
      expect(log[1].hash).to.equal(headOnLane);
      expect(log[1].parents[0]).to.equal(headOnMain);
    });
  });

  describe('merge with squash when other lane is ahead by only 1 snap, so no need to squash', () => {
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev');
    });
    it('should not add the squashed prop into the version object', () => {
      const head = helper.command.catComponent(`comp1@${headOnLane}`);
      expect(head).to.not.have.property('squashed');
      expect(head.modified).to.have.lengthOf(0);
    });
  });

  describe('merge with squash after exporting and importing the lane to a new workspace', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.createLane('dev');
      helper.fixtures.populateComponents(3);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      // headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      // as an intermediate step, verify that it has 3 snaps.
      const log = helper.command.logParsed('comp1');
      expect(log).to.have.lengthOf(3);
      helper.command.export();

      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();

      helper.command.mergeLane(`${helper.scopes.remote}/dev`, '--skip-dependency-installation');
    });
    // previously it was throwing "the component X has no versions and the head is empty"
    it('should be able to run bit-import', () => {
      expect(() => helper.command.import()).not.to.throw();
    });
    it('should show only one snap as staged', () => {
      const staged = helper.command.statusJson().stagedComponents;
      expect(staged[0].versions).to.have.lengthOf(1);
    });
    describe('exporting', () => {
      it('should export with no errors', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
      it('should update the VersionHistory on the remote with the new squash data', () => {
        const versionHistory = helper.command.catVersionHistory(
          `${helper.scopes.remote}/comp1`,
          helper.scopes.remotePath
        );
        const head = helper.command.getHead(`${helper.scopes.remote}/comp1`);
        const headVer = versionHistory.versions.find((v) => v.hash === head);
        expect(headVer.parents).to.have.lengthOf(0);
        expect(headVer.squashed).to.have.lengthOf(1);
      });
    });
  });
});
