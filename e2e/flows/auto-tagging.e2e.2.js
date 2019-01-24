import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';

chai.use(require('chai-fs'));

describe('auto tagging functionality', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });
  describe('after tagging dependencies only (not dependents)', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * We change the dependency is-type implementation. When tagging this change, we expect all dependent of is-type
     * to be updated as well so then their 'dependencies' attribute includes the latest version of is-type.
     * In this case, is-string should be updated to include is-type with v2.
     */
    describe('as AUTHORED', () => {
      let clonedScope;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponentUtilsIsType();
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponentUtilsIsString();
        helper.tagAllComponents();

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        const tagOutput = helper.tagComponent('utils/is-type');
        expect(tagOutput).to.have.string('auto-tagged components');
        expect(tagOutput).to.have.string('utils/is-string');
        // notice how is-string is not manually tagged again!
        helper.exportAllComponents();
        clonedScope = helper.cloneLocalScope();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        // notice the "v2" (!)
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
      describe('auto-tagging after export', () => {
        before(() => {
          helper.getClonedLocalScope(clonedScope);
          const isTypeFixtureV3 = "module.exports = function isType() { return 'got is-type v3'; };";
          helper.createFile('utils', 'is-type.js', isTypeFixtureV3); // modify is-type
          const tagOutput = helper.tagComponent('utils/is-type');
          expect(tagOutput).to.have.string('auto-tagged components');
          expect(tagOutput).to.have.string('utils/is-string');
        });
        it('the dependent should not be shown as modified after the tag', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.not.have.a.string('modified components');
        });
      });
    });
    describe('as IMPORTED', () => {
      let tagOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponentUtilsIsType();
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponentUtilsIsString();
        helper.tagAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');
        helper.importComponent('utils/is-type');

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        tagOutput = helper.tagComponent('utils/is-type');
      });
      it('should auto-tag the dependents', () => {
        expect(tagOutput).to.not.have.string('no auto-tag pending components');
        expect(tagOutput).to.have.string('auto-tagged components');
        expect(tagOutput).to.have.string('utils/is-string');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string'); // notice the "v2"
      });
    });
    describe('with dependents tests failing', () => {
      let tagOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.importTester('bit.envs/testers/mocha@0.0.12');
        helper.installNpmPackage('chai', '4.1.2');
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponentUtilsIsType();
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.createFile('utils', 'is-string.spec.js', fixtures.isStringSpec(true));

        helper.addComponent('utils/is-string.js', { t: 'utils/is-string.spec.js', i: 'utils/is-string' });
        helper.tagAllComponents(); // tests are passing at this point
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');
        helper.importComponent('utils/is-type');

        const isTypeFixtureChanged = "module.exports = function isType() { return 'got is-type!'; }"; // notice the addition of "!" which will break the the tests.
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureChanged); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
      });
      describe('running all tests', () => {
        let testResults;
        before(() => {
          testResults = helper.runWithTryCatch('bit test');
        });
        it('should test also the auto tag pending components', () => {
          expect(testResults).to.have.string('utils/is-string');
        });
        it('should fail the tests because of the auto tag', () => {
          expect(testResults).to.have.string('tests failed');
        });
      });
      describe('tagging without --verbose flag', () => {
        before(() => {
          try {
            tagOutput = helper.tagComponent('utils/is-type');
          } catch (err) {
            tagOutput = err.toString();
          }
        });
        it('should not auto-tag the dependents', () => {
          expect(tagOutput).to.have.string(
            'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command\n'
          );
        });
      });
      describe('tagging with --verbose flag', () => {
        before(() => {
          try {
            tagOutput = helper.tagComponent('utils/is-type --verbose');
          } catch (err) {
            tagOutput = err.toString() + err.stdout.toString();
          }
        });
        it('should not auto-tag the dependents', () => {
          expect(tagOutput).to.have.string(
            'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command\n'
          );
        });
        it('should display the failing tests results', () => {
          expect(tagOutput).to.have.string('tests failed');
          expect(tagOutput).to.have.string(
            "expected 'got is-type! and got is-string' to equal 'got is-type and got is-string'"
          );
        });
      });
    });
  });
  describe('with dependencies of dependencies', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * We change the dependency is-type implementation. When tagging this change, we expect all dependent of is-type
     * to be updated as well so then their 'dependencies' attribute includes the latest version of is-type.
     * In this case, is-string (so-called "dependent") should be updated to include is-type with v2.
     * Also, bar/foo (so-called "dependent of dependent") should be updated to include is-string and is-type with v2.
     */
    describe('as AUTHORED', () => {
      let tagOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponentUtilsIsType();
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponentUtilsIsString();
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.tagAllComponents();

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');

        tagOutput = helper.tagComponent('utils/is-type');
      });
      it('should auto tag the dependencies and the nested dependencies', () => {
        expect(tagOutput).to.have.string('auto-tagged components');
        expect(tagOutput).to.have.string('utils/is-string@0.0.2');
        expect(tagOutput).to.have.string('bar/foo@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
        const barFoo = helper.catComponent('utils/is-string@latest');
        expect(barFoo.dependencies[0].id.name).to.equal('utils/is-type');
        expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
        const barFoo = helper.catComponent('bar/foo@latest');
        expect(barFoo.dependencies[0].id.name).to.equal('utils/is-string');
        expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.2' });
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: '0.0.2' });
      });
      it('bit-status should show them all as staged and not modified', () => {
        const status = helper.statusJson();
        expect(status.modifiedComponent).to.be.empty;
        expect(status.stagedComponents).to.include('bar/foo');
        expect(status.stagedComponents).to.include('utils/is-string');
        expect(status.stagedComponents).to.include('utils/is-type');
      });
      describe('importing the component to another scope', () => {
        before(() => {
          helper.exportAllComponents();

          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should use the updated dependencies and print the results from the latest versions', () => {
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
          const result = helper.runCmd('node app.js');
          // notice the "v2" (!)
          expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo');
        });
      });
    });
    describe('as IMPORTED', () => {
      let tagOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponentUtilsIsType();
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponentUtilsIsString();
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.tagAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.importComponent('utils/is-string');
        helper.importComponent('utils/is-type');

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        tagOutput = helper.tagComponent('utils/is-type');
      });
      it('should auto-tag the dependents', () => {
        expect(tagOutput).to.not.have.string('no auto-tag pending components');
        expect(tagOutput).to.have.string('auto-tagged components');
        expect(tagOutput).to.have.string('utils/is-string');
        expect(tagOutput).to.have.string('bar/foo');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');

        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo'); // notice the "v2"
      });
    });
  });
  describe('with long chain of dependencies, some are nested', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('bar', 'a.js', 'require("./b")');
      helper.createFile('bar', 'b.js', 'require("./c")');
      helper.createFile('bar', 'c.js', 'require("./d")');
      helper.createFile('bar', 'd.js', 'require("./e")');
      helper.createFile('bar', 'e.js', 'console.log("I am E v1")');
      helper.addComponent('bar/*.js', { n: 'bar' });
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/e');
      helper.importComponent('bar/d');
      helper.importComponent('bar/c');
      helper.importComponent('bar/a');

      helper.createFile('components/bar/e', 'e.js', 'console.log("I am E v2")');
    });
    it('bit-status should show only the IMPORTED dependents of the modified component as auto-tag pending', () => {
      const status = helper.statusJson();
      expect(status.autoTagPendingComponents).to.deep.include(`${helper.remoteScope}/bar/c`);
      expect(status.autoTagPendingComponents).to.deep.include(`${helper.remoteScope}/bar/d`);
      expect(status.autoTagPendingComponents).to.not.deep.include(`${helper.remoteScope}/bar/b`); // it's nested
      expect(status.autoTagPendingComponents).to.not.deep.include(`${helper.remoteScope}/bar/a`); // it's a dependent via nested
    });
    describe('after tagging the components', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.tagAllComponents();
      });
      it('should auto tag only IMPORTED', () => {
        expect(tagOutput).to.have.string('auto-tagged components');
        expect(tagOutput).to.have.string('bar/c@0.0.2');
        expect(tagOutput).to.have.string('bar/d@0.0.2');
        expect(tagOutput).to.not.have.string('bar/b');
        expect(tagOutput).to.not.have.string('bar/a');
      });
      it('should update the dependencies and the flattenedDependencies of the IMPORTED dependents with the new versions', () => {
        const barC = helper.catComponent(`${helper.remoteScope}/bar/c@latest`);
        expect(barC.dependencies[0].id.name).to.equal('bar/d');
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        expect(barC.flattenedDependencies).to.deep.include({
          scope: helper.remoteScope,
          name: 'bar/d',
          version: '0.0.2'
        });
        expect(barC.flattenedDependencies).to.deep.include({
          scope: helper.remoteScope,
          name: 'bar/e',
          version: '0.0.2'
        });

        const barD = helper.catComponent(`${helper.remoteScope}/bar/d@latest`);
        expect(barD.dependencies[0].id.name).to.equal('bar/e');
        expect(barD.dependencies[0].id.version).to.equal('0.0.2');

        expect(barD.flattenedDependencies).to.deep.include({
          scope: helper.remoteScope,
          name: 'bar/e',
          version: '0.0.2'
        });
      });
      it('should update the dependencies correctly in the .bitmap file', () => {
        const bitMap = helper.readBitMapWithoutVersion();
        const barC = bitMap[`${helper.remoteScope}/bar/c@0.0.2`];
        expect(barC.dependencies).to.include(`${helper.remoteScope}/bar/d@0.0.2`);
        expect(barC.dependencies).to.include(`${helper.remoteScope}/bar/e@0.0.2`);

        const barD = bitMap[`${helper.remoteScope}/bar/d@0.0.2`];
        expect(barD.dependencies).to.include(`${helper.remoteScope}/bar/e@0.0.2`);
      });
      it('bit-status should not show any component as modified', () => {
        const status = helper.statusJson();
        expect(status.modifiedComponent).to.be.empty;
      });
    });
  });
  describe('with cyclic dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('bar', 'a.js', 'require("./b")');
      helper.createFile('bar', 'b.js', 'require("./c")');
      helper.createFile('bar', 'c.js', 'require("./a"); console.log("I am C v1")');
      helper.addComponent('bar/*.js', { n: 'bar' });
      helper.tagAllComponents();
      helper.createFile('bar', 'c.js', 'require("./a"); console.log("I am C v2")');
    });
    it('bit status should recognize the auto tag pending components', () => {
      const output = helper.statusJson();
      expect(output.autoTagPendingComponents).to.deep.include('bar/a');
      expect(output.autoTagPendingComponents).to.deep.include('bar/b');
    });
    describe('after tagging the components', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.tagAllComponents();
      });
      it('should auto tag all dependents', () => {
        expect(tagOutput).to.have.string('auto-tagged components');
        expect(tagOutput).to.have.string('bar/a@0.0.2');
        expect(tagOutput).to.have.string('bar/b@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the all dependents with the new versions', () => {
        const barA = helper.catComponent('bar/a@latest');
        expect(barA.dependencies[0].id.name).to.equal('bar/b');
        expect(barA.dependencies[0].id.version).to.equal('0.0.2');

        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });
        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '0.0.2' });

        const barB = helper.catComponent('bar/b@latest');
        expect(barB.dependencies[0].id.name).to.equal('bar/c');
        expect(barB.dependencies[0].id.version).to.equal('0.0.2');

        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '0.0.2' });
        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the modified component with the cycle dependency', () => {
        const barC = helper.catComponent('bar/c@latest');
        expect(barC.dependencies[0].id.name).to.equal('bar/a');
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });

        // @todo: we have a bug there. it shows itself as a flattened dependency.
        expect(barC.flattenedDependencies).to.have.lengthOf(2);
      });
    });
  });
  describe('with same component as direct and indirect dependent (A in: A => B => C, A => C)', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('bar', 'a.js', 'require("./b"); require("./c");');
      helper.createFile('bar', 'b.js', 'require("./c")');
      helper.createFile('bar', 'c.js', 'console.log("I am C v1")');
      helper.addComponent('bar/*.js', { n: 'bar' });
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/a');
      helper.importComponent('bar/b');
      helper.importComponent('bar/c');

      // as an intermediate step, make sure the re-link done by import C, didn't break anything
      const output = helper.runCmd('bit status');
      expect(output).to.have.a.string(statusWorkspaceIsCleanMsg);

      helper.createFile('components/bar/c', 'c.js', 'console.log("I am C v2")');
    });
    it('bit-status should show the auto-tagged pending', () => {
      const status = helper.statusJson();
      expect(status.autoTagPendingComponents).to.include(`${helper.remoteScope}/bar/a`);
      expect(status.autoTagPendingComponents).to.include(`${helper.remoteScope}/bar/b`);
    });
    describe('tagging the dependency', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.tagComponent('bar/c');
      });
      it('should bump the component version that is direct and indirect dependent only once', () => {
        expect(tagOutput).to.have.string('bar/a@0.0.2');

        const barA = helper.catComponent(`${helper.remoteScope}/bar/a`);
        const barAVersions = Object.keys(barA.versions);
        expect(barAVersions).to.include('0.0.1');
        expect(barAVersions).to.include('0.0.2');
        expect(barAVersions).to.have.lengthOf(2);
      });
    });
  });
});
