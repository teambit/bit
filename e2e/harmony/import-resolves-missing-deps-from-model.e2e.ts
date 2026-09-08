import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

// Regression test: a component whose source code requires a package that's recorded only in
// the component's model (not in the workspace policy of the importing workspace) should NOT
// surface as a MissingPackagesDependenciesOnFs issue after `bit import`. Before the fix in
// auto-detect-deps.processMissing, when the package wasn't yet in node_modules at the moment
// dependency resolution ran, it was reported missing — even though the imported component's
// model already listed it as a packageDependency. The fix consults componentFromModel in
// processMissing and treats the package as resolved.
//
// The test uses --skip-dependency-installation on import so the install step (which can hide
// the bug by hoisting the package via the scope's dependenciesGraph) doesn't run. That makes
// the auto-detect path the only thing deciding whether the issue is reported, which is exactly
// the path the fix targets.
describe('bit import: missing-package issue suppressed when the model lists the package', function () {
  this.timeout(0);
  let helper: Helper;
  let issueTypes: string[];
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    helper.fixtures.createComponentBarFoo(`require('is-positive');`);
    helper.fixtures.addComponentBarFoo();
    helper.command.install('--add-missing-deps');
    helper.command.tagAllWithoutBuild();
    helper.command.export();

    helper.scopeHelper.reInitWorkspace();
    helper.scopeHelper.addRemoteScope();
    helper.command.importComponentWithoutInstall('bar/foo');
    issueTypes = helper.command.getAllIssuesFromStatus();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('does not report MissingPackagesDependenciesOnFs for a package present in the model', () => {
    expect(issueTypes).to.not.include('MissingPackagesDependenciesOnFs');
  });
});
