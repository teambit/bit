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
    helper.fs.outputFile(
      `comp1/index.js`,
      `const React = require("react"); require("is-odd"); // eslint-disable-line`
    );
    helper.workspaceJsonc.addKeyValToDependencyResolver('policy', {
      dependencies: {
        'is-odd': '1.0.0',
      },
    });
    helper.command.install('--add-missing-deps');
    helper.command.tagAllComponents('--skip-tests');
    helper.command.export();

    helper.scopeHelper.reInitWorkspace();
    helper.scopeHelper.addRemoteScope();
    helper.command.import(`${helper.scopes.remote}/comp1@latest`);

    helper.command.dependenciesWrite();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('should add dependencies to workspace.jsonc', () => {
    expect(helper.workspaceJsonc.getPolicyFromDependencyResolver().dependencies['is-odd']).to.eq('1.0.0');
  });
});

