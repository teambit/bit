import chai, { expect } from 'chai';
import path from 'path';
import fs from 'fs-extra';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

describe('auto tagging functionality', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });
  describe('after committing dependencies only (not dependents)', () => {
    /**
     * Directory structure of the author
     * bar/foo.js
     * utils/is-string.js
     * utils/is-type.js
     *
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * We change the dependency is-type implementation. When committing this change, we expect all dependent of is-type
     * to be updated as well so then their 'dependencies' attribute includes the latest version of is-type.
     * In this case, is-string should be updated to include is-type with v2.
     */
    describe('as AUTHORED', () => {
      let clonedScope;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.commitAllComponents();

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        const commitOutput = helper.commitComponent('utils/is-type');
        expect(commitOutput).to.have.string('auto-tagged components');
        expect(commitOutput).to.have.string('utils/is-string');
        // notice how is-string is not manually committed again!
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
          const commitOutput = helper.commitComponent('utils/is-type');
          expect(commitOutput).to.have.string('auto-tagged components');
          expect(commitOutput).to.have.string('utils/is-string');
        });
        it('the dependent should not be shown as modified after the commit', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.not.have.a.string('modified components');
        });
      });
    });
    describe('as IMPORTED', () => {
      let commitOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.commitAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');
        helper.importComponent('utils/is-type');

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');
        commitOutput = helper.commitComponent('utils/is-type');
      });
      it('should auto-tag the dependents', () => {
        expect(commitOutput).to.not.have.string('no auto-tag pending components');
        expect(commitOutput).to.have.string('auto-tagged components');
        expect(commitOutput).to.have.string('utils/is-string');
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
      let commitOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.importTester('bit.envs/testers/mocha@0.0.12');
        helper.installNpmPackage('chai', '4.1.2');
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.createFile('utils', 'is-string.spec.js', fixtures.isStringSpec(true));

        helper.addComponentWithOptions('utils/is-string.js', { t: 'utils/is-string.spec.js' });
        helper.tagAllWithoutMessage(); // tests are passing at this point
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
            commitOutput = helper.commitComponent('utils/is-type');
          } catch (err) {
            commitOutput = err.toString();
          }
        });
        it('should not auto-tag the dependents', () => {
          expect(commitOutput).to.have.string(
            'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command\n'
          );
        });
      });
      describe('tagging with --verbose flag', () => {
        before(() => {
          try {
            commitOutput = helper.commitComponent('utils/is-type --verbose');
          } catch (err) {
            commitOutput = err.toString() + err.stdout.toString();
          }
        });
        it('should not auto-tag the dependents', () => {
          expect(commitOutput).to.have.string(
            'component tests failed. please make sure all tests pass before tagging a new version or use the "--force" flag to force-tag components.\nto view test failures, please use the "--verbose" flag or use the "bit test" command\n'
          );
        });
        it('should display the failing tests results', () => {
          expect(commitOutput).to.have.string('tests failed');
          expect(commitOutput).to.have.string(
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
     * We change the dependency is-type implementation. When committing this change, we expect all dependent of is-type
     * to be updated as well so then their 'dependencies' attribute includes the latest version of is-type.
     * In this case, is-string (so-called "dependent") should be updated to include is-type with v2.
     * Also, bar/foo (so-called "dependent of dependent") should be updated to include is-string and is-type with v2.
     */
    describe('as AUTHORED', () => {
      let commitOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.commitAllComponents();

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');

        commitOutput = helper.commitComponent('utils/is-type');
      });
      it('should auto tag the dependencies and the nested dependencies', () => {
        expect(commitOutput).to.have.string('auto-tagged components');
        expect(commitOutput).to.have.string('utils/is-string@0.0.2');
        expect(commitOutput).to.have.string('bar/foo@0.0.2');
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
      let commitOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createFile('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createFile('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.commitAllComponents();
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
        commitOutput = helper.commitComponent('utils/is-type');
      });
      it('should auto-tag the dependents', () => {
        expect(commitOutput).to.not.have.string('no auto-tag pending components');
        expect(commitOutput).to.have.string('auto-tagged components');
        expect(commitOutput).to.have.string('utils/is-string');
        expect(commitOutput).to.have.string('bar/foo');
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
      helper.addComponent('bar/*.js');
      helper.tagAllWithoutMessage();
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
      let commitOutput;
      before(() => {
        commitOutput = helper.tagAllWithoutMessage();
      });
      it('should auto tag only IMPORTED', () => {
        expect(commitOutput).to.have.string('auto-tagged components');
        expect(commitOutput).to.have.string('bar/c@0.0.2');
        expect(commitOutput).to.have.string('bar/d@0.0.2');
        expect(commitOutput).to.not.have.string('bar/b');
        expect(commitOutput).to.not.have.string('bar/a');
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
    });
  });
  describe('with cyclic dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('bar', 'a.js', 'require("./b")');
      helper.createFile('bar', 'b.js', 'require("./c")');
      helper.createFile('bar', 'c.js', 'require("./a"); console.log("I am C v1")');
      helper.addComponent('bar/*.js');
      helper.tagAllWithoutMessage();
      helper.createFile('bar', 'c.js', 'require("./a"); console.log("I am C v2")');
    });
    it('bit status should recognize the auto tag pending components', () => {
      const output = helper.statusJson();
      expect(output.autoTagPendingComponents).to.deep.include('bar/a');
      expect(output.autoTagPendingComponents).to.deep.include('bar/b');
    });
    describe('after tagging the components', () => {
      let commitOutput;
      before(() => {
        commitOutput = helper.tagAllWithoutMessage();
      });
      it('should auto tag all dependents', () => {
        expect(commitOutput).to.have.string('auto-tagged components');
        expect(commitOutput).to.have.string('bar/a@0.0.2');
        expect(commitOutput).to.have.string('bar/b@0.0.2');
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
});
