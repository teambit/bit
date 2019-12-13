import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

chai.use(require('chai-fs'));

describe('bit lane command', function() {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('creating a new lane without any component', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.command.createLane();
      output = helper.command.showLanes();
    });
    it('bit lane should show the active lane', () => {
      expect(output).to.have.string('* dev');
    });
  });
  describe('create a snap on master then on a new lane', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponents();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponents();
    });
    it('bit status should show the component only once as staged', () => {
      const status = helper.command.statusJson();
      expect(status.stagedComponents).to.have.lengthOf(1);
      expect(status.importPendingComponents).to.have.lengthOf(0);
      expect(status.invalidComponents).to.have.lengthOf(0);
      expect(status.modifiedComponent).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(0);
      expect(status.outdatedComponents).to.have.lengthOf(0);
    });
    describe('bit lane with --components flag', () => {
      let output: string;
      before(() => {
        output = helper.command.showLanes('--components');
      });
      it('should show all lanes and mark the current one', () => {
        expect(output).to.have.string('master');
        expect(output).to.have.string('* dev');
      });
    });
    describe('exporting the lane', () => {
      before(() => {
        helper.command.exportLane('dev');
      });
      it('should export components on that lane', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
      it('bit status should show a clean state', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.have.string(statusWorkspaceIsCleanMsg);
      });
      describe('importing the lane', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('dev --lanes');
        });
        it('should import components on that lane', () => {
          const list = helper.command.listLocalScopeParsed();
          expect(list).to.have.lengthOf(1);
        });
        it('bit status should show a clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
      });
    });
  });
  describe('create a snap on a new lane then tagged', () => {
    let lanes;
    let firstSnap;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.createLane();
      helper.command.snapAllComponents();
      firstSnap = helper.command.getHeadOfLane('dev', 'bar/foo');
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.tagAllComponents();
      lanes = helper.command.showLanesParsed();
    });
    it('the new tag should not change the head of the lane', () => {
      expect(lanes.dev[0].id.name).to.equal('bar/foo');
      expect(lanes.dev[0].head).to.equal(firstSnap);
    });
    it('the tag should be saved globally, as master', () => {
      expect(lanes.master[0].id.name).to.equal('bar/foo');
      expect(lanes.master[0].head).to.equal('0.0.1');
    });
  });
});
