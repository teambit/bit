import path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import chai, { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit rename command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('rename an exported component with --deprecate', () => {
    let scopeAfterExport: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      scopeAfterExport = helper.scopeHelper.cloneWorkspace();
    });
    describe('rename with no flag', () => {
      before(() => {
        helper.command.rename('comp1', 'comp2', '--deprecate');
      });
      it('should create a new component', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(1);
      });
      it('should deprecate the original component', () => {
        const showDeprecation = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(showDeprecation.config.deprecate).to.be.true;
        expect(showDeprecation.config).to.have.property('newId');
        expect(showDeprecation.config.newId.name).to.equal('comp2');
      });
      it('should reference the original component in the new component', () => {
        const showDeprecation = helper.command.showAspectConfig('comp2', Extensions.renaming);
        expect(showDeprecation.config).to.have.property('renamedFrom');
        expect(showDeprecation.config.renamedFrom.name).to.equal('comp1');
      });
      it('should list both components', () => {
        const list = helper.command.listParsed();
        const ids = list.map((_) => _.id);
        expect(ids).to.include(`${helper.scopes.remote}/comp1`);
        expect(ids).to.include(`${helper.scopes.remote}/comp2`);
      });
    });
    describe('rename with --scope', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeAfterExport);
        helper.command.rename('comp1', 'comp2', '--scope org.ui');
      });
      it('should save the entered scope as the defaultScope', () => {
        const show = helper.command.showComponentParsedHarmony('comp2');
        const scope = show.find((item) => item.title === 'id');
        expect(scope.json).to.equal('org.ui/comp2');
      });
    });
    describe('rename with invalid name', () => {
      it('should delete the newly created component-dir', () => {
        try {
          helper.command.rename('comp1', 'my.comp'); // the dot is invalid here
        } catch (err: any) {
          expect(err.message).to.have.string('error');
        }
        expect(path.join(helper.scopes.localPath, helper.scopes.remote, 'my.comp')).to.not.be.a.path();
      });
    });
    describe('rename when the path is not empty', () => {
      before(() => {
        helper.fs.outputFile('src/index.ts', 'hello');
      });
      it('should throw an error', () => {
        expect(() => helper.command.rename('comp1', 'comp2', '--path src')).to.throw(
          'unable to create component at "src", this directory is not empty'
        );
      });
    });
    describe('rename with --delete flag', () => {
      before(() => {
        helper.scopeHelper.getClonedWorkspace(scopeAfterExport);
        helper.command.rename('comp1', 'comp2', '--delete');
      });
      it('should create a new component', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(1);
      });
      it('should delete the original component', () => {
        const showRemove = helper.command.showAspectConfig('comp1', Extensions.remove);
        expect(showRemove.config.removed).to.be.true;
      });
    });
  });
  describe('rename a new component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.rename('comp1', 'comp2');
    });
    it('should remove the source component', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap).to.not.have.property('comp1');
    });
    it('should rename the source to the target id', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap).to.have.property('comp2');
    });
    it('workspace should have one component only', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });
  describe('rename a new component when the scope is different than the defaultScope', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.setScope('different-scope', 'comp1');
      // previously it was errored with "error: component "different-scope/comp1" was not found on your local workspace".
      helper.command.rename('comp1', 'comp2');
    });
    it('should rename successfully', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap).to.not.have.property('comp1');
      expect(bitmap).to.have.property('comp2');
    });
  });
  describe('rename a new component scope-name', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.fixtures.populateComponents(1);
      helper.command.rename('comp1', 'comp1', '--scope scope2');
    });
    it('should change the defaultScope of the component', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.defaultScope).to.equal('scope2');
    });
  });
  describe('rename with refactoring when the code has other non-import occurrences', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.populateComponents(2);
      helper.fs.outputFile(
        'comp1/index.js',
        `const comp2 = require('@my-scope/comp2');
      const comp2Other = require('@my-scope/comp2-other');
      module.exports = () => 'comp1 and ' + comp2();`
      );
      helper.command.rename('comp2', 'my-new-name', '--refactor');
    });
    it('should only replace the exact occurrence of the import statement, not others', () => {
      const content = helper.fs.readFile('comp1/index.js');
      expect(content).to.have.string('my-scope/my-new-name');
      expect(content).to.have.string('my-scope/comp2-other');
      expect(content).to.not.have.string('my-scope/my-new-name-other');
    });
  });
  describe('wrong rename with scope-name inside the name', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.addDefaultScope('owner.scope');
      helper.fixtures.populateComponents(1);
    });
    // previously, it was letting renaming, but afterwards, after any command, it was throwing InvalidName because the
    // scope-name was entered as part of the name.
    it('bit rename should throw', () => {
      expect(() => helper.command.rename('owner.scope/comp1', 'owner.scope2/comp2')).to.throw();
    });
  });
  describe('rename scope-name without refactoring', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.addDefaultScope('owner.scope');
      helper.fixtures.populateComponents(2);
      helper.command.rename('comp2', 'comp2', '--scope owner2.scope2');
    });
    it('bit status should show an issue because the code points to the renamed component', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
    });
  });
  describe('rename scope-name with refactoring', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.workspaceJsonc.addDefaultScope('owner.scope');
      helper.fixtures.populateComponents(2);
      helper.command.rename('comp2', 'comp2', '--scope owner2.scope2 --refactor');
    });
    // previously, rename command was throwing saying the old and new package names are the same
    it('bit status should not show an issue because the source code has changed to the new package-name', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
    });
  });
  describe('rename a new aspect without --preserve flag', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.create('bit-aspect', 'my-aspect');
      helper.command.rename('my-aspect', 'foo');
    });
    it('should rename the root-dir', () => {
      expect(path.join(helper.scopes.localPath, `${helper.scopes.remote}/my-aspect`)).to.not.be.a.path();
      expect(path.join(helper.scopes.localPath, `${helper.scopes.remote}/foo`)).to.be.a.directory();
    });
    it('should rename the files', () => {
      expect(path.join(helper.scopes.localPath, `${helper.scopes.remote}/foo`, 'foo.aspect.ts')).to.be.a.file();
      expect(
        path.join(helper.scopes.localPath, `${helper.scopes.remote}/foo`, 'my-aspect.aspect.ts')
      ).to.not.be.a.path();
    });
    it('should rename the class-name', () => {
      const fileContent = helper.fs.readFile(path.join(`${helper.scopes.remote}/foo`, 'foo.aspect.ts'));
      expect(fileContent).to.have.string('FooAspect');
      expect(fileContent).to.not.have.string('MyAspectAspect');
    });
  });
  describe('rename a new aspect with --preserve flag', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.create('bit-aspect', 'my-aspect');
      helper.command.rename('my-aspect', 'foo', '--preserve');
    });
    it('should not rename the root-dir', () => {
      expect(path.join(helper.scopes.localPath, `${helper.scopes.remote}/my-aspect`)).to.be.a.directory();
      expect(path.join(helper.scopes.localPath, `${helper.scopes.remote}/foo`)).to.not.be.a.path();
    });
    it('should not rename the files', () => {
      expect(
        path.join(helper.scopes.localPath, `${helper.scopes.remote}/my-aspect`, 'my-aspect.aspect.ts')
      ).to.be.a.file();
      expect(
        path.join(helper.scopes.localPath, `${helper.scopes.remote}/my-aspect`, 'foo.aspect.ts')
      ).to.not.be.a.path();
    });
    it('should not rename the class-name', () => {
      const fileContent = helper.fs.readFile(path.join(`${helper.scopes.remote}/my-aspect`, 'my-aspect.aspect.ts'));
      expect(fileContent).to.have.string('MyAspectAspect');
      expect(fileContent).to.not.have.string('FooAspect');
    });
  });
  describe('rename an exported aspect', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.command.create('bit-aspect', 'my-aspect');
      helper.command.install();
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.rename('my-aspect', 'foo', '--deprecate');
    });
    it('should rename the files', () => {
      expect(path.join(helper.scopes.localPath, `${helper.scopes.remote}/foo`, 'foo.aspect.ts')).to.be.a.file();
      expect(
        path.join(helper.scopes.localPath, `${helper.scopes.remote}/foo`, 'my-aspect.aspect.ts')
      ).to.not.be.a.path();
    });
    it('should rename the class-name', () => {
      const fileContent = helper.fs.readFile(path.join(`${helper.scopes.remote}/foo`, 'foo.aspect.ts'));
      expect(fileContent).to.have.string('FooAspect');
      expect(fileContent).to.not.have.string('MyAspectAspect');
    });
    it('should not rename the class-name of the original component', () => {
      const fileContent = helper.fs.readFile(path.join(`${helper.scopes.remote}/my-aspect`, 'my-aspect.aspect.ts'));
      expect(fileContent).to.have.string('MyAspectAspect');
      expect(fileContent).to.not.have.string('FooAspect');
    });
  });
  describe('rename a new component including the namespace and the scope-name', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1, false);
    });
    it('should not throw ComponentNotFound', () => {
      expect(() => helper.command.rename('comp1', 'ui/comp2', '--scope another-scope')).to.not.throw();
      const list = helper.command.listParsed();
      expect(list[0].id).to.equal('another-scope/ui/comp2');
    });
  });
  describe('rename an exported component from a lane', () => {
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.command.createLane('my-lane');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.rename('comp1', 'comp11');
      helper.command.snapAllComponentsWithoutBuild();
      headOnLane = helper.command.getHeadOfLane('my-lane', 'comp1');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLaneWithoutBuild('my-lane', '-x');
    });
    it('should merge the component to main', () => {
      const catComp1 = helper.command.catComponent('comp1');
      expect(catComp1.head).to.equal(headOnLane);
    });
    it('should delete the component from main', () => {
      const removeData = helper.command.showAspectConfig('comp1', Extensions.remove);
      expect(removeData.config.removed).to.be.true;
    });
  });
  describe('rename an exported component from a lane that does not exist on main', () => {
    let headOnLane: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.createLane('my-lane');
      helper.command.snapAllComponentsWithoutBuild('--unmodified');
      helper.command.export();
      helper.command.rename('comp1', 'comp11');
      helper.command.snapAllComponentsWithoutBuild();
      headOnLane = helper.command.getHeadOfLane('my-lane', 'comp1');
      helper.command.export();
      helper.command.switchLocalLane('main', '-x');
      helper.command.mergeLaneWithoutBuild('my-lane', '-x');
    });
    it('should not merge the component to main', () => {
      const catComp1 = helper.command.catComponent('comp1');
      expect(catComp1.head).to.not.equal(headOnLane);
    });
  });
});
