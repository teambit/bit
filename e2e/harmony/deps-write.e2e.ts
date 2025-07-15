import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('dependencies write', function () {
  this.timeout(0);
  let helper: Helper;
  before(async () => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();

    helper.fixtures.populateComponents(1);
    helper.extensions.workspaceJsonc.addKeyValToDependencyResolver('rootComponents', true);
    helper.fs.outputFile(`comp1/index.js`, `const React = require("react"); require("is-odd"); // eslint-disable-line`);
    helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
      dependencies: {
        'is-odd': '1.0.0',
      },
    });
    helper.command.install('--add-missing-deps');
    helper.command.tagAllComponents('--skip-tests');
    helper.command.export();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('using deps write command', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp1@latest`);

      helper.command.dependenciesWrite();
      helper.command.dependenciesWrite('--target=package.json');
    });
    it('should add dependencies to workspace.jsonc', () => {
      expect(helper.workspaceJsonc.getPolicyFromDependencyResolver().dependencies['is-odd']).to.eq('1.0.0');
    });
    it('should add dependencies to package.json', () => {
      expect(helper.packageJson.read().dependencies['is-odd']).to.eq('1.0.0');
    });
  });
  describe('using import command', () => {
    before(() => {
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.command.import(`${helper.scopes.remote}/comp1@latest --write-deps=package.json`);
    });
    it('should add dependencies to package.json', () => {
      expect(helper.packageJson.read().dependencies['is-odd']).to.eq('1.0.0');
    });
  });
});
