import chai, { expect } from 'chai';
import path from 'path';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

chai.use(require('chai-fs'));

describe('bit scope command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('bit scope fork', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      output = helper.command.forkScope(helper.scopes.remote, 'org.scope');
    });
    it('should show the forked components from the scope', () => {
      expect(output).to.have.string('org.scope/comp1');
      expect(output).to.have.string('org.scope/comp2');
      expect(output).to.have.string('org.scope/comp3');
    });
    it('bit show should show the original component in the fork section', () => {
      const showFork = helper.command.showAspectConfig('comp1', Extensions.forking);
      expect(showFork.config).to.have.property('forkedFrom');
      expect(showFork.config.forkedFrom.scope).to.equal(helper.scopes.remote);
      expect(showFork.config.forkedFrom.name).to.equal('comp1');
    });
  });
  describe('bit scope rename', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.renameScope(helper.scopes.remote, 'new-scope');
    });
    it('should rename the scope', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
      expect(list[0].id).to.equal('new-scope/comp1');
    });
    it('should delete the old link to node_modules', () => {
      const linkPath = path.join(helper.scopes.localPath, 'node_modules', `@${helper.scopes.remote}`, 'comp1');
      expect(linkPath).to.not.be.a.path();
    });
    it('should create a new link to node_modules', () => {
      const linkPath = path.join(helper.scopes.localPath, 'node_modules', '@new-scope', 'comp1');
      expect(linkPath).to.be.a.directory();
    });
    it('should compile the renamed components', () => {
      const linkPath = path.join(helper.scopes.localPath, 'node_modules', '@new-scope', 'comp1', 'dist');
      expect(linkPath).to.be.a.directory();
    });
  });
  describe('bit scope rename --refactor', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes({ addRemoteScopeAsDefaultScope: false });
      helper.fixtures.populateComponents(3);
      helper.workspaceJsonc.addKeyVal('my-scope/comp2', {});
      helper.command.renameScope('my-scope', helper.scopes.remote, '--refactor');
    });
    it('should change the package name in the component files', () => {
      const comp2Content = helper.fs.readFile(`${helper.scopes.remote}/comp2/index.js`);
      expect(comp2Content).to.not.include('my-scope');
      expect(comp2Content).to.include(helper.scopes.remote);
    });
    it('should also change the aspect-id in the workspace.jsonc', () => {
      const workspaceJsonc = helper.workspaceJsonc.read();
      expect(workspaceJsonc).to.have.property(`${helper.scopes.remote}/comp2`);
      expect(workspaceJsonc).not.to.have.property(`my-scope/comp2`);
    });
  });
  describe('bit scope rename, some components are exported some are new', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3);
      helper.command.tagWithoutBuild('comp3', '--skip-auto-tag');
      helper.command.export();
      helper.command.renameScope(helper.scopes.remote, 'my-scope', '--refactor --deprecate');
    });
    it('should deprecate the exported one (comp3)', () => {
      const showDeprecation = helper.command.showAspectConfig(`${helper.scopes.remote}/comp3`, Extensions.deprecation);
      expect(showDeprecation.config.deprecate).to.be.true;
      expect(showDeprecation.config).to.have.property('newId');
      expect(showDeprecation.config.newId.name).to.equal('comp3');
      expect(showDeprecation.config.newId.scope).to.equal('my-scope');
    });
    it('should rename the new ones', () => {
      const list = helper.command.listParsed();
      const ids = list.map((c) => c.id);
      expect(ids).to.have.members([
        'my-scope/comp1',
        'my-scope/comp2',
        'my-scope/comp3',
        `${helper.scopes.remote}/comp3`,
      ]);
    });
    it('bit status should not have issues', () => {
      helper.command.expectStatusToNotHaveIssues();
    });
    it('bit status should show 3 new components and one modified (comp3 due to deprecation)', () => {
      const status = helper.command.statusJson();
      expect(status.newComponents).to.have.lengthOf(3);
      expect(status.modifiedComponents).to.have.lengthOf(1);
    });
  });
  describe('bit scope rename-owner', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.workspaceJsonc.addDefaultScope('old-org.my-scope');
      helper.fixtures.populateComponents(2);
      helper.command.setScope('old-org.my-scope1', 'comp1');
      helper.command.setScope('old-org.my-scope2', 'comp2');

      helper.command.renameScopeOwner('old-org', 'new-org');
    });
    it('should rename the default-scope in workspace.jsonc', () => {
      expect(helper.workspaceJsonc.getDefaultScope()).to.equal('new-org.my-scope');
    });
    it('should rename the scope of the components', () => {
      const list = helper.command.listParsed();
      const ids = list.map((c) => c.id);
      expect(ids).to.have.members(['new-org.my-scope1/comp1', 'new-org.my-scope2/comp2']);
    });
    it('should delete the old link to node_modules', () => {
      const linkPath1 = path.join(helper.scopes.localPath, 'node_modules', '@old-org/my-scope1.comp1');
      expect(linkPath1).to.not.be.a.path();
      const linkPath2 = path.join(helper.scopes.localPath, 'node_modules', '@old-org/my-scope2.comp2');
      expect(linkPath2).to.not.be.a.path();
    });
    it('should create a new link to node_modules', () => {
      const linkPath1 = path.join(helper.scopes.localPath, 'node_modules', '@new-org/my-scope1.comp1');
      expect(linkPath1).to.be.a.directory();
      const linkPath2 = path.join(helper.scopes.localPath, 'node_modules', '@new-org/my-scope2.comp2');
      expect(linkPath2).to.be.a.directory();
    });
    it('should compile the renamed components', () => {
      const linkPath = path.join(helper.scopes.localPath, 'node_modules', '@new-org/my-scope1.comp1/dist');
      expect(linkPath).to.be.a.directory();
    });
  });
  describe('bit scope fork when the paths of two components conflicting', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.fs.outputFile('comp1/ui/index.js');
      helper.command.addComponent('comp1/ui', '--id comp1/ui');
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
    });
    it('should not throw an error about a component is nested in another component dir', () => {
      const cmd = () => helper.command.forkScope(helper.scopes.remote, 'org.scope', '-x');
      expect(cmd).to.not.throw();
    });
  });
});
