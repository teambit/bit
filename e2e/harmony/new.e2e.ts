import path from 'path';
import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('new command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('export a workspace-template aspect', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.scopeHelper.addRemoteScope(undefined, undefined, true);
      helper.command.create('workspace-generator', 'workspace-example');
      helper.bitJsonc.addToVariant('*', 'teambit.harmony/aspect', {});
      helper.command.install();

      const indexPath = path.join(helper.scopes.remote, 'workspace-example/template/index.ts');
      const indexContent = helper.fs.readFile(indexPath);
      const updatedIndex = indexContent.replace('teambit.react/templates/ui/text', `${helper.scopes.remote}/comp1`);
      helper.fs.outputFile(indexPath, updatedIndex);

      helper.command.tagAllComponents();
      helper.command.export();

      helper.scopeHelper.cleanLocalScope(); // it deletes all content without bit-init
      helper.scopeHelper.addRemoteScope(undefined, undefined, true);
      helper.command.new('template-example', `--aspect ${helper.scopes.remote}/workspace-example`);
    });
    after(() => {
      helper.scopeHelper.removeRemoteScope(undefined, true);
    });
    it('should generate a new workspace, import components and add them as new with no issues', () => {
      const wsPath = path.join(helper.scopes.localPath, 'my-workspace');
      const status = helper.command.statusJson(wsPath);
      expect(status.newComponents).to.have.lengthOf(1);
      helper.command.expectStatusToNotHaveIssues(wsPath);
    });
    it('should not add env dependencies to the workspace.jsonc', () => {
      const wsPath = path.join(helper.scopes.localPath, 'my-workspace');
      const configFile = helper.bitJsonc.read(wsPath);
      const dependencies = configFile['teambit.dependencies/dependency-resolver'].policy.dependencies;
      expect(dependencies).to.not.have.property('@babel/runtime');
      expect(dependencies).to.not.have.property('@types/jest');
      expect(dependencies).to.not.have.property('@types/node');
    });
  });
  describe('running inside workspace', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
    });
    it('should throw an error', () => {
      expect(() => helper.command.new('react')).to.throw();
    });
  });
  // @todo: fix. it throws an error on Circle only - "GET https://node.bit.dev/@teambit%2Freact.templates.env.templates: Not Found - 404"
  describe.skip('creating a new react workspace', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopeHelper.cleanLocalScope(); // it deletes all content without bit-init
      helper.command.new('react');
    });
    it('bit status should be clean', () => {
      const wsPath = path.join(helper.scopes.localPath, 'my-workspace');
      helper.command.expectStatusToNotHaveIssues(wsPath);
    });
  });
});
