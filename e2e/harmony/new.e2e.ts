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
  it('entering a non-exist workspace, should throw a descriptive error', () => {
    helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
    helper.scopeHelper.cleanLocalScope(); // it deletes all content without bit-init
    expect(() =>
      helper.command.new('non-exist', '--aspect non.exist/aspect --load-from /non/exist/workspace')
    ).to.throw(`fatal: "/non/exist/workspace" is not a valid Bit workspace, make sure the path is correct`);
  });
  describe('export a workspace-template aspect', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();

      helper.scopeHelper.reInitLocalScopeWithDefault();
      helper.scopeHelper.addRemoteScope(undefined, undefined, true);
      helper.command.create('starter', 'workspace-example');
      helper.bitJsonc.addToVariant('*', 'teambit.harmony/aspect', {});
      helper.command.install();

      const starterPath = path.join(helper.scopes.remote, 'workspace-example/workspace-example.starter.ts');
      const starterContent = helper.fs.readFile(starterPath);
      const updatedIndex = starterContent.replace('teambit.react/templates/ui/text', `${helper.scopes.remote}/comp1`);
      helper.fs.outputFile(starterPath, updatedIndex);

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
      helper.scopeHelper.reInitLocalScope();
    });
    it('should throw an error', () => {
      expect(() => helper.command.new('react')).to.throw();
    });
  });
  describe('creating a new react workspace', () => {
    before(() => {
      helper.scopeHelper.newLocalScope('react');
    });
    it('bit status should be clean', () => {
      helper.command.expectStatusToNotHaveIssues();
    });
  });
});
