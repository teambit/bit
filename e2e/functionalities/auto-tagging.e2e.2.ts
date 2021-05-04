import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { AUTO_TAGGED_MSG } from '../../src/api/consumer/lib/tag';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('auto tagging functionality', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });

  after(() => {
    helper.scopeHelper.destroy();
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
        helper.fixtures.addComponentUtilsIsString();
        helper.command.tagAllComponents();

        helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2); // modify is-type
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        const tagOutput = helper.command.tagComponent('utils/is-type');
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('utils/is-string');
        // notice how is-string is not manually tagged again!
        helper.command.exportAllComponents();
        clonedScope = helper.scopeHelper.cloneLocalScope();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        // notice the "v2" (!)
        expect(result.trim()).to.equal('got is-type v2 and got is-string');
      });
      describe('auto-tagging after export', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(clonedScope);
          helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV3); // modify is-type
          const tagOutput = helper.command.tagComponent('utils/is-type');
          expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
          expect(tagOutput).to.have.string('utils/is-string');
        });
        it('the dependent should not be shown as modified after the tag', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.string('modified components');
        });
      });
    });
    describe('as IMPORTED', () => {
      let tagOutput;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
        helper.fixtures.addComponentUtilsIsString();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string');
        helper.command.importComponent('utils/is-type');

        helper.fs.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', fixtures.isTypeV2); // modify is-type
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        tagOutput = helper.command.tagComponent('utils/is-type');
      });
      it('should auto-tag the dependents', () => {
        expect(tagOutput).to.not.have.string('no auto-tag pending components');
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('utils/is-string');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('utils/is-string');

        const appJsFixture = "const isString = require('./components/utils/is-string'); console.log(isString());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string'); // notice the "v2"
      });
    });
    describe('with dependents tests failing', () => {
      let tagOutput;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.env.importTester();
        helper.npm.installNpmPackage('chai', '4.1.2');
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
        helper.fs.createFile('utils', 'is-string.spec.js', fixtures.isStringSpec(true));

        helper.command.addComponent('utils/is-string.js', { t: 'utils/is-string.spec.js', i: 'utils/is-string' });
        helper.command.tagAllComponents(); // tests are passing at this point
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addGlobalRemoteScope();
        helper.command.importComponent('utils/is-string');
        helper.command.importComponent('utils/is-type');

        const isTypeFixtureChanged = "module.exports = function isType() { return 'got is-type!'; }"; // notice the addition of "!" which will break the the tests.
        helper.fs.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureChanged); // modify is-type
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
      });
      describe('running all tests', () => {
        let testResults;
        before(() => {
          testResults = helper.general.runWithTryCatch('bit test');
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
            tagOutput = helper.command.tagComponent('utils/is-type');
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
            tagOutput = helper.command.tagComponent('utils/is-type --verbose');
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
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
        helper.fixtures.addComponentUtilsIsString();
        helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();

        helper.fs.createFile('utils', 'is-type.js', fixtures.isTypeV2); // modify is-type
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');

        tagOutput = helper.command.tagComponent('utils/is-type');
      });
      it('should auto tag the dependencies and the nested dependencies', () => {
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('utils/is-string@0.0.2');
        expect(tagOutput).to.have.string('bar/foo@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the dependent with the new versions', () => {
        const barFoo = helper.command.catComponent('utils/is-string@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.dependencies[0].id.name).to.equal('utils/is-type');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the dependent of the dependent with the new versions', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.dependencies[0].id.name).to.equal('utils/is-string');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-type', version: '0.0.2' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.flattenedDependencies).to.deep.include({ name: 'utils/is-string', version: '0.0.2' });
      });
      it('bit-status should show them all as staged and not modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponent).to.be.empty;
        expect(status.stagedComponents).to.include('bar/foo');
        expect(status.stagedComponents).to.include('utils/is-string');
        expect(status.stagedComponents).to.include('utils/is-type');
      });
      describe('importing the component to another scope', () => {
        before(() => {
          helper.command.exportAllComponents();

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should use the updated dependencies and print the results from the latest versions', () => {
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
          const result = helper.command.runCmd('node app.js');
          // notice the "v2" (!)
          expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo');
        });
      });
    });
    describe('as IMPORTED', () => {
      let tagOutput;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
        helper.fixtures.addComponentUtilsIsType();
        helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
        helper.fixtures.addComponentUtilsIsString();
        helper.fixtures.createComponentBarFoo(fixtures.barFooFixture);
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        helper.command.importComponent('utils/is-string');
        helper.command.importComponent('utils/is-type');

        helper.fs.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', fixtures.isTypeV2); // modify is-type
        const statusOutput = helper.command.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        tagOutput = helper.command.tagComponent('utils/is-type');
      });
      it('should auto-tag the dependents', () => {
        expect(tagOutput).to.not.have.string('no auto-tag pending components');
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('utils/is-string');
        expect(tagOutput).to.have.string('bar/foo');
      });
      it('should use the updated dependencies and print the results from the latest versions', () => {
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');

        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type v2 and got is-string and got foo'); // notice the "v2"
      });
    });
  });
  describe('with long chain of dependencies, some are nested', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('bar', 'a.js', 'require("./b")');
      helper.fs.createFile('bar', 'b.js', 'require("./c")');
      helper.fs.createFile('bar', 'c.js', 'require("./d")');
      helper.fs.createFile('bar', 'd.js', 'require("./e")');
      helper.fs.createFile('bar', 'e.js', 'console.log("I am E v1")');
      helper.command.addComponent('bar/*.js', { n: 'bar' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/e');
      helper.command.importComponent('bar/d');
      helper.command.importComponent('bar/c');
      helper.command.importComponent('bar/a');

      helper.fs.createFile('components/bar/e', 'e.js', 'console.log("I am E v2")');
    });
    it('bit-status should show only the IMPORTED dependents of the modified component as auto-tag pending', () => {
      const status = helper.command.statusJson();
      expect(status.autoTagPendingComponents).to.deep.include(`${helper.scopes.remote}/bar/c@0.0.1`);
      expect(status.autoTagPendingComponents).to.deep.include(`${helper.scopes.remote}/bar/d@0.0.1`);
      expect(status.autoTagPendingComponents).to.not.deep.include(`${helper.scopes.remote}/bar/b`); // it's nested
      expect(status.autoTagPendingComponents).to.not.deep.include(`${helper.scopes.remote}/bar/a`); // it's a dependent via nested
    });
    describe('after tagging the components', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.command.tagAllComponents();
      });
      it('should auto tag only IMPORTED', () => {
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('bar/c@0.0.2');
        expect(tagOutput).to.have.string('bar/d@0.0.2');
        expect(tagOutput).to.not.have.string('bar/b');
        expect(tagOutput).to.not.have.string('bar/a');
      });
      it('should update the dependencies and the flattenedDependencies of the IMPORTED dependents with the new versions', () => {
        const barC = helper.command.catComponent(`${helper.scopes.remote}/bar/c@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.dependencies[0].id.name).to.equal('bar/d');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.deep.include({
          scope: helper.scopes.remote,
          name: 'bar/d',
          version: '0.0.2',
        });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.deep.include({
          scope: helper.scopes.remote,
          name: 'bar/e',
          version: '0.0.2',
        });

        const barD = helper.command.catComponent(`${helper.scopes.remote}/bar/d@latest`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barD.dependencies[0].id.name).to.equal('bar/e');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barD.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barD.flattenedDependencies).to.deep.include({
          scope: helper.scopes.remote,
          name: 'bar/e',
          version: '0.0.2',
        });
      });
      it('bit-status should not show any component as modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponent).to.be.empty;
      });
    });
  });
  // @todo: change the tagLegacy to tag once librarian is the package-manager for capsule to support cyclic
  describe('with cyclic dependencies', () => {
    let scopeBeforeTag;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJson.addKeyVal('packageManager', 'yarn');
      helper.fs.createFile('bar', 'a.js', 'require("./b")');
      helper.fs.createFile('bar', 'b.js', 'require("./c")');
      helper.fs.createFile('bar', 'c.js', 'require("./a"); console.log("I am C v1")');
      helper.command.addComponent('bar/*.js', { n: 'bar' });
      helper.command.tagAllComponents();
      helper.fs.createFile('bar', 'c.js', 'require("./a"); console.log("I am C v2")');
      scopeBeforeTag = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should recognize the auto tag pending components', () => {
      const output = helper.command.statusJson();
      expect(output.autoTagPendingComponents).to.deep.include('bar/a@0.0.1');
      expect(output.autoTagPendingComponents).to.deep.include('bar/b@0.0.1');
    });
    describe('tagging the components with auto-version-bump', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.command.tagAllComponents();
      });
      it('should auto tag all dependents', () => {
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('bar/a@0.0.2');
        expect(tagOutput).to.have.string('bar/b@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the all dependents with the new versions', () => {
        const barA = helper.command.catComponent('bar/a@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.dependencies[0].id.name).to.equal('bar/b');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '0.0.2' });

        const barB = helper.command.catComponent('bar/b@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.dependencies[0].id.name).to.equal('bar/c');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '0.0.2' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the modified component with the cycle dependency', () => {
        const barC = helper.command.catComponent('bar/c@latest');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.dependencies[0].id.name).to.equal('bar/a');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });

        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barC.flattenedDependencies).to.have.lengthOf(2);
      });
    });
    describe('tagging the components with a specific version', () => {
      // see https://github.com/teambit/bit/issues/2034 for the issue this test for
      let tagOutput: string;
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeBeforeTag);
        tagOutput = helper.command.tagAllComponents(undefined, '2.0.0');
      });
      it('should auto tag all dependents', () => {
        expect(tagOutput).to.have.string(AUTO_TAGGED_MSG);
        expect(tagOutput).to.have.string('bar/c@2.0.0');
        expect(tagOutput).to.have.string('bar/a@0.0.2');
        expect(tagOutput).to.have.string('bar/b@0.0.2');
      });
      it('should update the dependencies and the flattenedDependencies of the all dependents with the new versions', () => {
        const barA = helper.command.catComponent('bar/a@latest');
        expect(barA.dependencies[0].id.name).to.equal('bar/b');
        expect(barA.dependencies[0].id.version).to.equal('0.0.2');

        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });
        expect(barA.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '2.0.0' });

        const barB = helper.command.catComponent('bar/b@latest');
        expect(barB.dependencies[0].id.name).to.equal('bar/c');
        expect(barB.dependencies[0].id.version).to.equal('2.0.0');

        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/c', version: '2.0.0' });
        expect(barB.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
      });
      it('should update the dependencies and the flattenedDependencies of the modified component according to the specified version', () => {
        const barC = helper.command.catComponent('bar/c@latest');
        expect(barC.dependencies[0].id.name).to.equal('bar/a');
        expect(barC.dependencies[0].id.version).to.equal('0.0.2');

        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/a', version: '0.0.2' });
        expect(barC.flattenedDependencies).to.deep.include({ name: 'bar/b', version: '0.0.2' });

        expect(barC.flattenedDependencies).to.have.lengthOf(2);
      });
      describe('exporting the component', () => {
        before(() => {
          helper.command.exportAllComponents();
        });
        it('should be successful', () => {
          const listScope = helper.command.listRemoteScopeParsed();
          expect(listScope).to.have.lengthOf(3);
        });
      });
    });
  });
  describe('with same component as direct and indirect dependent (A in: A => B => C, A => C)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('bar', 'a.js', 'require("./b"); require("./c");');
      helper.fs.createFile('bar', 'b.js', 'require("./c")');
      helper.fs.createFile('bar', 'c.js', 'console.log("I am C v1")');
      helper.command.addComponent('bar/*.js', { n: 'bar' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/a');
      helper.command.importComponent('bar/b');
      helper.command.importComponent('bar/c');

      // as an intermediate step, make sure the re-link done by import C, didn't break anything
      helper.command.expectStatusToBeClean();

      helper.fs.createFile('components/bar/c', 'c.js', 'console.log("I am C v2")');
    });
    it('bit-status should show the auto-tagged pending', () => {
      const status = helper.command.statusJson();
      expect(status.autoTagPendingComponents).to.include(`${helper.scopes.remote}/bar/a@0.0.1`);
      expect(status.autoTagPendingComponents).to.include(`${helper.scopes.remote}/bar/b@0.0.1`);
    });
    describe('tagging the dependency', () => {
      let tagOutput;
      before(() => {
        tagOutput = helper.command.tagComponent('bar/c');
      });
      it('should bump the component version that is direct and indirect dependent only once', () => {
        expect(tagOutput).to.have.string('bar/a@0.0.2');

        const barA = helper.command.catComponent(`${helper.scopes.remote}/bar/a`);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        const barAVersions = Object.keys(barA.versions);
        expect(barAVersions).to.include('0.0.1');
        expect(barAVersions).to.include('0.0.2');
        expect(barAVersions).to.have.lengthOf(2);
      });
    });
  });
  describe('using --skip-auto-tag flag', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.command.tagAllComponents();
      helper.fs.outputFile('utils/is-type.js', fixtures.isTypeV2);
      // an intermediate step, make sure bit status shows components to be auto-tag.
      const statusOutput = helper.command.runCmd('bit status');
      expect(statusOutput).to.have.string('components pending to be tagged automatically');

      output = helper.command.tagAllComponents('--skip-auto-tag');
    });
    it('should not auto-tag the dependents', () => {
      expect(output).to.have.string('1 component(s) tagged');
      const scopeList = helper.command.listLocalScopeParsed();
      const barFoo: any = scopeList.find((c) => c.id === 'bar/foo');
      expect(barFoo.localVersion).to.equal('0.0.1');
      const isString: any = scopeList.find((c) => c.id === 'utils/is-string');
      expect(isString.localVersion).to.equal('0.0.1');
      const isType: any = scopeList.find((c) => c.id === 'utils/is-type');
      expect(isType.localVersion).to.equal('0.0.2');
    });
    describe('then tagging the dependent of the skipped dependency', () => {
      before(() => {
        helper.command.tagComponent('utils/is-string -f');
      });
      it('should update the flattened-dependencies of the dependent of that dependent', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        const isTypeDep = barFoo.flattenedDependencies.find((d) => d.name === 'utils/is-type');
        expect(isTypeDep.version).to.equal('0.0.2');
      });
    });
  });
});
