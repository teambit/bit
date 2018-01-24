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
        helper.createComponent('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createComponent('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.commitAllComponents();

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createComponent('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
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
          helper.createComponent('utils', 'is-type.js', isTypeFixtureV3); // modify is-type
          const commitOutput = helper.commitComponent('utils/is-type');
          expect(commitOutput).to.have.string('auto-tagged components');
          expect(commitOutput).to.have.string('utils/is-string');
        });
        it('the dependent should not be shown as modified after the commit', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.a.string('no modified components');
        });
      });
    });
    describe('as IMPORTED', () => {
      let commitOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponent('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createComponent('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.commitAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('utils/is-string');
        helper.importComponent('utils/is-type');

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createComponent(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2); // modify is-type
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
  });

  // todo: this was implemented in https://github.com/teambit/bit/pull/603, remove the 'skip' once merging it.
  describe.skip('with dependencies of dependencies', () => {
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
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponent('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createComponent('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.commitAllComponents();

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createComponent('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
        const statusOutput = helper.runCmd('bit status');
        expect(statusOutput).to.have.string('components pending to be tagged automatically');

        const commitOutput = helper.commitComponent('utils/is-type');
        expect(commitOutput).to.have.string('auto-tagged components');
        expect(commitOutput).to.have.string('utils/is-string');
        expect(commitOutput).to.have.string('bar/foo');
        // notice how is-string and bar-foo are not manually committed again.
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
    describe('as IMPORTED', () => {
      let commitOutput;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.createComponent('utils', 'is-type.js', fixtures.isType);
        helper.addComponent('utils/is-type.js');
        helper.createComponent('utils', 'is-string.js', fixtures.isString);
        helper.addComponent('utils/is-string.js');
        helper.createComponentBarFoo(fixtures.barFooFixture);
        helper.addComponentBarFoo();
        helper.commitAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        helper.importComponent('utils/is-type');

        const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
        helper.createComponent(path.join('components', 'utils', 'is-type'), 'is-type.js', isTypeFixtureV2); // modify is-type
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
});
