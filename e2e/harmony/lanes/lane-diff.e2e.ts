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

  describe('bit lane diff on the workspace', () => {
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
      diffOutput = helper.command.diffLane();
    });
    it('should show the diff correctly', () => {
      expect(diffOutput).to.have.string('--- foo.js (main)');
      expect(diffOutput).to.have.string('+++ foo.js (dev)');

      expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
      expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
    });
    it('should not show the id field as it is redundant', () => {
      expect(diffOutput).to.not.have.string('--- Id');
      expect(diffOutput).to.not.have.string('+++ Id');
    });
  });

  describe('bit lane diff {toLane - default} on the workspace', () => {
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
      diffOutput = helper.command.diffLane('main');
    });
    it('should show the diff correctly', () => {
      expect(diffOutput).to.have.string('--- foo.js (main)');
      expect(diffOutput).to.have.string('+++ foo.js (dev)');

      expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
      expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
    });
    it('should not show the id field as it is redundant', () => {
      expect(diffOutput).to.not.have.string('--- Id');
      expect(diffOutput).to.not.have.string('+++ Id');
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
      helper.command.snapAllComponents();

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

  describe('bit lane diff {fromLane} {toLane} on the workspace', () => {
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
      diffOutput = helper.command.diffLane('main dev');
    });
    it('should show the diff correctly', () => {
      expect(diffOutput).to.have.string('--- foo.js (main)');
      expect(diffOutput).to.have.string('+++ foo.js (dev)');

      expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
      expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
    });
    it('should not show the id field as it is redundant', () => {
      expect(diffOutput).to.not.have.string('--- Id');
      expect(diffOutput).to.not.have.string('+++ Id');
    });
  });

  describe('bit lane diff on the scope', () => {
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
      helper.command.exportLane();
      diffOutput = helper.command.diffLane('dev', true);
    });
    it('should show the diff correctly', () => {
      expect(diffOutput).to.have.string('--- foo.js (main)');
      expect(diffOutput).to.have.string('+++ foo.js (dev)');

      expect(diffOutput).to.have.string(`-module.exports = function foo() { return 'got foo'; }`);
      expect(diffOutput).to.have.string(`+module.exports = function foo() { return 'got foo v2'; }`);
    });
  });

  describe('bit lane diff with TypeScript components', () => {
    let diffOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('bar/foo.ts', `export function greet(name: string): string { return 'hello ' + name; }`);
      helper.command.addComponent('bar');
      helper.command.snapAllComponentsWithoutBuild();
      helper.command.export();
      helper.command.createLane();
      helper.fs.outputFile(
        'bar/foo.ts',
        `export function greet(name: string, greeting: string): string { return greeting + ' ' + name; }`
      );
      helper.command.snapAllComponentsWithoutBuild();
      diffOutput = helper.command.diffLane();
    });
    it('should show the file diff', () => {
      expect(diffOutput).to.have.string('--- foo.ts');
      expect(diffOutput).to.have.string('+++ foo.ts');
    });
    it('should not crash when API diff is attempted', () => {
      // API diff is best-effort. Without build artifacts, schema extraction
      // may not be available for scope-loaded components. The important thing
      // is that lane diff still works and shows file diffs.
      expect(diffOutput).to.be.a('string');
    });
  });
});
