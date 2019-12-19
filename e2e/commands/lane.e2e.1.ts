import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import { LANE_KEY } from '../../src/consumer/bit-map/bit-map';

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
          const list = helper.command.listLocalScopeParsed('--scope');
          expect(list).to.have.lengthOf(1);
        });
        it('bit status should show a clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
      });
      describe('importing the lane objects and switching to that lane', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('dev --lanes --objects');
          helper.command.checkout(`${helper.scopes.remote} dev --lane`);
        });
        it('should write the component to the filesystem with the same version as the lane', () => {
          const fileContent = helper.fs.readFile('components/bar/foo/foo.js');
          expect(fileContent).to.equal(fixtures.fooFixtureV2);
        });
        it('.bitmap should save the remote lane', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap[LANE_KEY]).to.deep.equal({ name: 'dev', scope: helper.scopes.remote });
        });
        it('bit lane should show the component in the checked out lane', () => {
          const lanes = helper.command.showLanesParsed();
          expect(lanes).to.have.property('dev');
          expect(lanes.dev).to.have.lengthOf(1);
          expect(lanes.dev[0].id.name).to.equal('bar/foo');
        });
        it('bit status should not show the component as pending updates', () => {
          const status = helper.command.statusJson();
          expect(status.outdatedComponents).to.have.lengthOf(0);
        });
        it('bit status should show clean state', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string(statusWorkspaceIsCleanMsg);
        });
        it('bit lane should show the checked out lane as the active one', () => {
          const lanes = helper.command.showLanes();
          expect(lanes).to.have.string('* dev');
          expect(lanes).to.not.have.string('* master');
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
