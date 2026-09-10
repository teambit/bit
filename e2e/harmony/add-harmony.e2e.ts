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
  describe('removing the workspace-root component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.outputFile('comp1/index.js', 'module.exports = () => "comp1";\n');
      helper.command.addComponent('comp1', { i: 'comp1' });
      helper.fs.outputFile('README.md', '# workspace root\n');
      helper.fs.outputFile('untracked-by-bit.txt', 'not a component file\n');
      helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' });
      helper.command.removeComponent('ws-root --silent');
    });
    it('should not delete the workspace', () => {
      // its rootDir is the workspace itself, so deleting it takes .bitmap, .bit, every nested
      // component and every unrelated file with it.
      expect(path.join(helper.scopes.localPath, '.bitmap')).to.be.a.path();
      expect(path.join(helper.scopes.localPath, 'comp1/index.js')).to.be.a.path();
      expect(path.join(helper.scopes.localPath, 'untracked-by-bit.txt')).to.be.a.path();
      expect(path.join(helper.scopes.localPath, 'README.md')).to.be.a.path();
    });
    it('should keep the other component tracked', () => {
      expect(helper.bitMap.read()).to.have.property('comp1');
    });
  });
  describe('re-adding and double-adding the workspace root', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.outputFile('README.md', '# workspace root\n');
      helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' });
    });
    it('should allow re-adding the same component', () => {
      helper.fs.outputFile('extra.md', 'extra\n');
      expect(() => helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' })).to.not.throw();
    });
    it('should reject a second component claiming the workspace root', () => {
      const cmd = () => helper.command.addComponent('.', { i: 'another-root', m: 'README.md' });
      expect(cmd).to.throw('already tracked by');
    });
    it('should pick up dotfiles at add time, not only on the next rescan', () => {
      helper.fs.outputFile('.npmrc', 'registry=https://example.com\n');
      const output = helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' });
      expect(output).to.have.string('.npmrc');
    });
  });
  describe('writing the workspace-root component to the filesystem', () => {
    let firstSnap: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('comp1/index.js', 'module.exports = () => "comp1";\n');
      helper.command.addComponent('comp1', { i: 'comp1' });
      helper.fs.outputFile('README.md', '# workspace root\n');
      helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' });
      helper.command.snapAllComponentsWithoutBuild('--ignore-issues "*"');
      firstSnap = helper.command.getHead('ws-root');
      helper.fs.outputFile('README.md', '# workspace root v2\n');
      helper.command.snapAllComponentsWithoutBuild('--ignore-issues "*"');
    });
    it('should check out an earlier version of it without throwing', () => {
      // the writer used to hard-fail on a rootDir of "." with a non-BitError.
      expect(() => helper.command.checkoutVersion(firstSnap, 'ws-root', '-x')).to.not.throw();
    });
    describe('importing it into another workspace', () => {
      before(() => {
        helper.command.export();
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponentWithoutInstall('ws-root');
      });
      it('should not write a .bitmap outside the workspace root', () => {
        // a .bitmap inside a component dir turns that dir into a broken nested workspace - every
        // bit command run from there operates on it instead of on the real workspace.
        const bitmaps = helper.fs.getConsumerFiles('.bitmap', true, false);
        expect(bitmaps).to.deep.equal([path.normalize('.bitmap')]);
      });
    });
    describe('importing it onto the root of an empty workspace', () => {
      // this is how a git-free workspace is restored from its scope: the root component's files
      // land on top of the freshly initialized workspace, at the root.
      before(() => {
        helper.scopeHelper.reInitWorkspace();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponentWithoutInstall('ws-root', '--path .');
      });
      it('should write its files at the workspace root', () => {
        expect(path.join(helper.scopes.localPath, 'README.md')).to.be.a.file().with.content('# workspace root v2\n');
      });
      it('should record "." as its rootDir', () => {
        expect(helper.bitMap.read()['ws-root'].rootDir).to.equal('.');
      });
      it('should leave the live .bitmap alone rather than overwrite it with the exported one', () => {
        // the exported .bitmap lists comp1. the restored workspace must not inherit that entry.
        expect(helper.bitMap.read()).to.not.have.property('comp1');
      });
    });
  });
  describe('env of the workspace-root component', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fs.outputFile('comp1/index.js', 'module.exports = () => "comp1";\n');
      helper.command.addComponent('comp1', { i: 'comp1' });
      helper.fs.outputFile('README.md', '# workspace root\n');
      helper.command.addComponent('.', { i: 'ws-root', m: 'README.md' });
    });
    it('should default to the empty env, not to the regular default env', () => {
      // it is a bag of the workspace's own config files - nothing compiles it, tests it, or
      // imports it as a package. the regular default env would give it a toolchain it can't use.
      expect(helper.env.getComponentEnv('ws-root')).to.equal('teambit.harmony/empty-env');
    });
    it('should leave the env of a regular component alone', () => {
      expect(helper.env.getComponentEnv('comp1')).to.equal('teambit.harmony/node');
    });
    it('should not report compiler-derived issues, while a regular component still does', () => {
      const issuesOf = (name: string): string[] => {
        const comp = helper.command.statusJson().componentsWithIssues.find((c) => c.id.includes(name));
        return comp ? comp.issues.map((issue) => issue.type) : [];
      };
      // the empty env has no compiler, so "missing dists" can never apply to the root component.
      expect(issuesOf('ws-root')).to.not.include('MissingDists');
      expect(issuesOf('comp1')).to.include('MissingDists');
    });
    describe('when a root file has a relative import into a component', () => {
      before(() => {
        helper.fs.outputFile('app.js', "const comp1 = require('./comp1');\n");
      });
      it('should report the relative-import issue like any other component', () => {
        // the root component is not exempt from this one. without it, the user gets an
        // "this error should have never happened" failure when the Version object is saved.
        expect(helper.command.getAllIssuesFromStatus()).to.include('RelativeComponentsAuthored');
      });
    });
  });
});
