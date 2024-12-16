import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit reset when on lane', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('snapping on a lane, switching to main, snapping and running "bit reset"', () => {
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev');
      helper.command.resetAll();
    });
    it('should not delete the head of the lane', () => {
      expect(() => helper.command.catObject(headOnLane)).to.not.throw();
    });
    it('bit status should not throw after switching to the lane', () => {
      helper.command.switchLocalLane('dev');
      expect(() => helper.command.status()).not.to.throw();
    });
  });
  describe('reset on lane after export from main', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('bit reset should not throw', () => {
      expect(() => helper.command.resetAll()).to.not.throw();
    });
  });
  // this state is now impossible because we blocked the option to create a lane when there are
  describe.skip('reset on lane after fork from another non-exported lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('bit status should show two snaps as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents[0].versions).to.have.lengthOf(2);
    });
    it('bit reset should reset the component to new', () => {
      expect(() => helper.command.resetAll()).to.not.throw();
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(1);
    });
  });
  describe('reset on lane after fork from another exported lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('bit status should show only one version as staged, not two', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents[0].versions).to.have.lengthOf(1);
    });
    it('bit reset should not throw', () => {
      expect(() => helper.command.resetAll()).to.not.throw();
    });
  });
  describe('reset on a new lane after merging from another lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.createLane('dev2');
      helper.command.mergeLane(`${helper.scopes.remote}/dev`);
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('bit status should show not only one version as staged, but two', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents[0].versions).to.have.lengthOf(2);
    });
    // suggesting the user to either remove the component or the lane. (we don't have a better solution here.
    // it is similar to running git-reset without specifying any origin and expecting all the local commits to be removed.
    // there is no way to know what should be the new head)
    it('bit reset should throw a descriptive error suggesting either removing the component or the lane', () => {
      expect(() => helper.command.resetAll()).to.throw();
    });
  });
  describe('reset after merge where it snapped multiple snaps on the other lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane('dev2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.switchLocalLane('dev', '-x');
      // this is intended. so then later on, the workspace won't have these snaps, only the latest
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importLane('dev2', '-x');
      helper.command.mergeLane(`${helper.scopes.remote}/dev`, '-x');
    });
    // previously, it was throwing VersionNotFound error as it doesn't have the version objects snapped on the other lane
    it('bit reset should not throw', () => {
      expect(() => helper.command.resetAll()).not.to.throw();
    });
  });
  describe('reset a component that was just introduced to the lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.reset('comp1');
    });
    it('should remove the component from the lane', () => {
      const lane = helper.command.showOneLaneParsed('dev');
      expect(lane.components).to.have.lengthOf(1);
      expect(lane.components[0].id).to.include('comp2');
      expect(lane.components[0].id).to.not.include('comp1');
    });
  });
});
