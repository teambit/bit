import chai, { expect } from 'chai';
import { fixtures, Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('lanes diff operations', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('bit lane diff operations', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.exportLane();
    });

    describe('bit lane diff on the scope', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('dev', true);
      });
      it('should show the diff', () => {
        expect(diffOutput).to.have.string('console.log("v2")');
      });
    });

    describe('bit lane diff on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main');
      });
      it('should show the diff', () => {
        expect(diffOutput).to.have.string('console.log("v2")');
      });
      it('should show the file names', () => {
        expect(diffOutput).to.have.string('bar/foo/foo.js');
      });
      it('should show the legends', () => {
        expect(diffOutput).to.have.string('--- bar/foo/foo.js (main)');
        expect(diffOutput).to.have.string('+++ bar/foo/foo.js (dev)');
      });
    });

    describe('bit lane diff {toLane - default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main');
      });
      it('should show the diff', () => {
        expect(diffOutput).to.have.string('console.log("v2")');
      });
      it('should show the file names', () => {
        expect(diffOutput).to.have.string('bar/foo/foo.js');
      });
      it('should show the legends', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');
      });
    });

    describe('bit lane diff {toLane - non default} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        helper.command.switchLocalLane('main');
        helper.command.createLane('stage');
        helper.fixtures.createComponentBarFoo('console.log("v3")');
        helper.command.snapAllComponentsWithoutBuild();
        helper.command.export();
        helper.command.switchLocalLane('dev');
        diffOutput = helper.command.diffLane('stage');
      });
      it('should show the diff', () => {
        expect(diffOutput).to.have.string('console.log("v3")');
      });
      it('should show the legends', () => {
        expect(diffOutput).to.have.string('--- foo.js (stage)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');
      });
    });

    describe('bit lane diff {fromLane} {toLane} on the workspace', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main dev');
      });
      it('should show the diff', () => {
        expect(diffOutput).to.have.string('console.log("v2")');
      });
      it('should show the legends', () => {
        expect(diffOutput).to.have.string('--- foo.js (main)');
        expect(diffOutput).to.have.string('+++ foo.js (dev)');
      });
    });
  });
});
