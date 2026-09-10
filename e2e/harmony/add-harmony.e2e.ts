import chai from 'chai';
import path from 'path';
import { ParentDirTracked, AddingIndividualFiles } from '@teambit/tracker';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
chai.use(chaiFs);
const { expect } = chai;

describe('add command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('adding files when workspace is new', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.createComponentBarFoo();
    });
    it('should throw an error AddingIndividualFiles', () => {
      const addFunc = () => helper.command.addComponent('bar/foo.js');
      const error = new AddingIndividualFiles(path.normalize('bar/foo.js'));
      helper.general.expectToThrow(addFunc, error);
    });
  });
  describe('add a directory inside an existing component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/foo/foo.ts');
    });
    it('should throw a descriptive error about parent-dir is tracked', () => {
      const cmd = () => helper.command.addComponent('comp1/foo');
      const error = new ParentDirTracked('comp1', `${helper.scopes.remote}/comp1`, path.normalize('comp1/foo'));
      helper.general.expectToThrow(cmd, error);
    });
  });
  describe('adding the workspace root as a component', () => {
    let rootFiles: string[];
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('README.md', '# workspace root\n');
      helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' });
      // written after tracking. the root file-set is re-scanned, not frozen at add-time.
      helper.fs.outputFile('LICENSE', 'MIT\n');
      rootFiles = helper.command.showComponentParsed('ws-root').files.map((file) => file.relativePath);
    });
    it('should save "." as the rootDir', () => {
      expect(helper.bitMap.read()['ws-root'].rootDir).to.equal('.');
    });
    it('should own the root files, including files added after it was tracked', () => {
      expect(rootFiles).to.include('README.md');
      expect(rootFiles).to.include('LICENSE');
    });
    it('should not claim the files of the component nested inside it', () => {
      expect(rootFiles.some((file) => file.startsWith('comp1/'))).to.be.false;
    });
    it('should track .bitmap, so a git-free workspace can be restored from the scope', () => {
      expect(rootFiles).to.include('.bitmap');
    });
    it('should not claim the local scope directory', () => {
      expect(rootFiles.some((file) => file.startsWith('.bit/'))).to.be.false;
    });
  });
  describe('workspace-root component and .bitmap', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      // deliberately not using populateComponents - it writes an app.js at the workspace root that
      // requires './comp1'. the root component would then own a file with a relative dependency on
      // another component, which bit rejects regardless of this feature.
      helper.fs.outputFile('comp1/index.js', 'module.exports = () => "comp1";\n');
      helper.command.addComponent('comp1', { i: 'comp1' });
      helper.fs.outputFile('README.md', '# workspace root\n');
      helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' });
      helper.command.snapAllComponentsWithoutBuild('--ignore-issues "*"');
    });
    it('should not be modified right after snapping, despite tracking .bitmap', () => {
      // .bitmap is rewritten with the new versions on every snap - including the root component's
      // own entry. without normalizing those fields out, the component would never converge.
      expect(helper.command.statusJson().modifiedComponents).to.have.lengthOf(0);
    });
    describe('adding a new component inside the workspace root', () => {
      before(() => {
        helper.fs.outputFile('comp2/index.js', 'module.exports = () => "comp2";\n');
        helper.command.addComponent('comp2', { i: 'comp2' });
      });
      it('should let the new component take the files from the root component', () => {
        const rootFiles = helper.command.showComponentParsed('ws-root').files.map((file) => file.relativePath);
        expect(rootFiles.some((file) => file.startsWith('comp2/'))).to.be.false;
      });
      it('should mark the root component as modified, because the map changed', () => {
        expect(helper.command.statusJson().modifiedComponents).to.have.lengthOf(1);
      });
      it('should converge again after snapping the map change', () => {
        helper.command.snapAllComponentsWithoutBuild('--ignore-issues "*"');
        expect(helper.command.statusJson().modifiedComponents).to.have.lengthOf(0);
      });
    });
  });
});
