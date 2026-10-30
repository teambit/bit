import chai, { expect } from 'chai';
import { Helper, fixtures } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);

describe('bit lane diff operations', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  // main has foo, the lane "dev" has foo-v2. every arg form below resolves to the same pair of
  // lanes, so they share one workspace and only differ in how from/to are given on the command line.
  describe('diffing the current lane against main', () => {
    const expectMainToDevDiff = (diffOutput: string) => {
      expect(diffOutput).to.have.string('--- foo.js (main)');
      expect(diffOutput).to.have.string('+++ foo.js (dev)');
      expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
      expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
    };
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
    });
    describe('with no args', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane();
      });
      it('should show the diff correctly', () => {
        expectMainToDevDiff(diffOutput);
      });
      it('should not show the id field as it is redundant', () => {
        expect(diffOutput).to.not.have.string('--- Id');
        expect(diffOutput).to.not.have.string('+++ Id');
      });
    });
    describe('with {toLane} being the default lane', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main');
      });
      it('should show the diff correctly', () => {
        expectMainToDevDiff(diffOutput);
      });
    });
    describe('with {fromLane} {toLane}', () => {
      let diffOutput: string;
      before(() => {
        diffOutput = helper.command.diffLane('main dev');
      });
      it('should show the diff correctly', () => {
        expectMainToDevDiff(diffOutput);
      });
    });
    describe('on the scope, after exporting the lane', () => {
      let diffOutput: string;
      before(() => {
        helper.command.exportLane();
        diffOutput = helper.command.diffLane('dev', true);
      });
      it('should show the diff correctly', () => {
        expectMainToDevDiff(diffOutput);
      });
    });
  });

  describe('bit lane diff {toLane - non default} on the workspace', () => {
    let diffOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV2);
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.switchLocalLane('main');
      helper.command.createLane('stage');
      helper.fixtures.createComponentBarFoo(fixtures.fooFixtureV3);
      helper.command.snapAllComponentsWithoutBuild();

      diffOutput = helper.command.diffLane('dev');
    });
    it('should show the diff correctly', () => {
      expect(diffOutput).to.have.string('--- foo.js (dev)');
      expect(diffOutput).to.have.string('+++ foo.js (stage)');

      expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo v2'; }`);
      expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v3'; }`);
    });
    it('should not show the id field as it is redundant', () => {
      expect(diffOutput).to.not.have.string('--- Id');
      expect(diffOutput).to.not.have.string('+++ Id');
    });
  });
});
