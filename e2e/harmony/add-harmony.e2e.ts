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
    it('should not claim bit internal files', () => {
      expect(rootFiles.some((file) => file.startsWith('.bit'))).to.be.false;
    });
  });
});
