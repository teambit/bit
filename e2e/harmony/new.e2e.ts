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
      const updatedIndex = indexContent.replace('learn-bit-react.base-ui/ui/img', `${helper.scopes.remote}/comp1`);
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
  });
});
