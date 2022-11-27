import chai, { expect } from 'chai';
import Helper from '../../../src/e2e-helper/e2e-helper';

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
      helper.command.createLane();
      helper.fixtures.populateComponents(1, false, 'v2');
      helper.command.snapAllComponentsWithoutBuild();
      headOnLane = helper.command.getHeadOfLane('dev', 'comp1');
      helper.command.switchLocalLane('main');
      helper.command.mergeLane('dev');
      helper.command.untagAll();
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
      expect(() => helper.command.untagAll()).to.not.throw();
    });
  });
  describe('reset on lane after fork from another non-exported lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1, false);
      helper.command.createLane();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.createLane('dev2');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
    });
    it('bit status should show two snaps as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents[0].versions).to.have.lengthOf(2);
    });
    it('bit reset should reset the component to new', () => {
      expect(() => helper.command.untagAll()).to.not.throw();
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
      expect(() => helper.command.untagAll()).to.not.throw();
    });
  });
  describe('reset on lane after merging from another lane', () => {
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
    // a previous buy showed two staged snaps, because the remote-head was empty.
    it('bit status should show only one version as staged, not two', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents[0].versions).to.have.lengthOf(1);
    });
    it('bit reset should not throw', () => {
      expect(() => helper.command.untagAll()).to.not.throw();
    });
  });
});
