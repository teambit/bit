import { IssuesClasses, MISSING_DEPS_SPACE } from '@teambit/component-issues';
import { expect } from 'chai';
import { statusFailureMsg } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('status command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('main filename is not index and dists are missing', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fs.outputFile('comp1/comp1.ts', "require('@my-scope/comp2');");
      helper.fs.outputFile('comp2/comp2.ts');
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.command.link();
    });
    it('should not show an issue of missing-packages', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
    });
  });
  describe('dists dir is deleted after caching the components', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.populateComponents(1);
      helper.command.status(); // to populate the cache
      // as an intermediate step, make sure the missing-dist is not an issue.
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingDists.name);
      const distDir = 'node_modules/@my-scope/comp1/dist';
      const distDirInBitRoots = 'node_modules/.bit_roots/teambit.harmony_node/node_modules/@my-scope/comp1/dist';
      helper.fs.deletePath(distDir);
      helper.fs.deletePath(distDirInBitRoots);
    });
    it('should show an issue of missing-dists', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MissingDists.name);
    });
    it('should exit with non zero exit-code if --strict flag is used', () => {
      let error;
      try {
        helper.command.runCmd('bit status --strict');
      } catch (err: any) {
        error = err;
      }
      expect(error.status).to.equal(1);
    });
  });
  describe('package dir is deleted from node-modules', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.populateComponents(1);
      helper.command.status(); // to populate the cache
      // as an intermediate step, make sure the missing-links is not an issue.
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingLinksFromNodeModulesToSrc.name);
      const pkgDir = 'node_modules/@my-scope/comp1';
      helper.fs.deletePath(pkgDir);
    });
    it('should show an issue of missing-links-from-node-modules-to-src', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MissingLinksFromNodeModulesToSrc.name);
    });
  });
  describe('components that are both: new and auto-tag-pending', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3');
      helper.fixtures.populateComponents(3, undefined, 'v2');
    });
    it('should be shown in the newComponents section only and not in the autoTagPendingComponents', () => {
      const status = helper.command.statusJson();
      expect(status.autoTagPendingComponents).to.have.lengthOf(0);
      expect(status.newComponents).to.have.lengthOf(2);
    });
  });
  describe('components that imports itself', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('bar/index.js', 'export const a = "b";');
      helper.fs.outputFile('bar/foo.js', `import { a } from '@${helper.scopes.remote}/bar';`);
      helper.command.add('bar');
      helper.command.link();
    });
    // @todo: maybe we should show a component-issue suggesting to fix the import statement
    it('should not add itself as a dependency', () => {
      const show = helper.command.showComponentParsed('bar');
      expect(show.dependencies).to.have.lengthOf(0);
    });
  });
  describe('status --quick flag', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3');
      helper.fs.appendFile('comp3/index.js', '\n// modified');
    });
    it('should show new and modified components', () => {
      const output = helper.command.runCmd('bit status --quick');
      expect(output).to.have.string('modified components (files only)');
      expect(output).to.have.string('comp3');
      expect(output).to.have.string('new components');
      expect(output).to.have.string('comp1');
      expect(output).to.have.string('comp2');
    });
    it('should return new and modified in json format', () => {
      const json = helper.command.statusJson(undefined, '--quick');
      expect(json.modified).to.include('my-scope/comp3');
      expect(json.newComponents).to.include('my-scope/comp1');
      expect(json.newComponents).to.include('my-scope/comp2');
    });
  });
  describe('deleting a dependency from the filesystem when the record is still in bitmap', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagWithoutBuild();
      helper.command.export();
      helper.fs.deletePath('comp2');
      helper.fs.appendFile('comp1/index.js');
    });
    it('bit status should not throw', () => {
      expect(() => helper.command.status()).not.to.throw();
    });
  });
  describe('when a component is created and added without its dependencies', () => {
    let output;
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.createFile(
        'comp1',
        'comp1.js',
        `require("./comp2");require("./comp3");require("./comp4");require("./comp5");require("./comp6");`
      );
      helper.fs.createFile('comp2', 'comp2.js', `require("./comp4");require("./comp5");`);
      helper.fs.createFile('comp3', 'comp3.js', '');
      helper.fs.createFile('comp4', 'comp4.js', '');
      helper.fs.createFile('comp5', 'comp5.js', 'require("./comp6");');
      helper.fs.createFile('comp6', 'comp6.js', '');
      helper.command.addComponent('comp1', { i: 'comp1' });
      helper.command.addComponent('comp5', { i: 'comp5' });
    });
    it('Should show missing dependencies', () => {
      output = helper.command.runCmd('bit status');
      expect(output).to.have.string('non-existing dependency files');
      expect(output).to.have.string('comp1 ... issues found');
      expect(output).to.have.string('comp1.js -> ./comp2, ./comp3, ./comp4, ./comp5, ./comp6');
      expect(output).to.have.string('comp5.js -> ./comp6');
      expect(output).to.have.string('comp5 ... issues found');
      // Validate indentations is correct, nested deps should be indent 2 more
      expect(output).to.have.string(`${MISSING_DEPS_SPACE}comp1.js`);
      expect(output).to.have.string(`${MISSING_DEPS_SPACE}comp5.js`);
    });
  });
  describe('dynamic import', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.createComponentBarFoo('const a = "./b"; import(a); require(a);');
      helper.fixtures.addComponentBarFoo();
      helper.command.compile();
    });
    it('status should not show the component as missing packages', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string(statusFailureMsg);
    });
  });
  describe('import from the index file', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.outputFile('comp1/index.ts', `export { hello } from './foo';`);
      helper.fs.outputFile('comp1/foo.ts', `export const hello = 'world';`);
      helper.fs.outputFile('comp1/bar.ts', `import { hello } from '.';`);
      helper.command.addComponent('comp1');
    });
    it('should show an ImportFromDirectory issue', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.ImportFromDirectory.name);
    });
  });
});
