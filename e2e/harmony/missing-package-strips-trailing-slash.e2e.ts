import { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import { Helper } from '@teambit/legacy.e2e-helper';

// Regression test: a require/import with a trailing slash like `require('events/')` —
// a common pattern in webpack browser-fallback configs — should be reported in the
// MissingPackagesDependenciesOnFs issue under the *package* name (`events`), not the
// original path (`events/`). Before this fix, `resolvePackageNameByPath` returned the
// original (non-normalized) string for single-segment paths, so the issue surfaced
// `events/` and any downstream matching against the real package name failed.
describe('MissingPackagesDependenciesOnFs strips trailing slash from package names', function () {
  this.timeout(0);
  let helper: Helper;
  let missingPackages: string[];
  before(() => {
    helper = new Helper();
    helper.scopeHelper.setWorkspaceWithRemoteScope();
    // `events` is a Node builtin; the trailing slash bypasses precinct's builtin filter and
    // forces the resolver to look it up as an npm package — but it isn't installed, so it
    // ends up in MissingPackagesDependenciesOnFs.
    helper.fixtures.createComponentBarFoo(`require('events/');`);
    helper.fixtures.addComponentBarFoo();
    const status = helper.command.statusJson();
    const issues = status.componentsWithIssues[0]?.issues || [];
    const missingPkgIssue = issues.find((i: any) => i.type === IssuesClasses.MissingPackagesDependenciesOnFs.name);
    missingPackages = missingPkgIssue?.data?.[0]?.missingPackages || [];
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  it('records the missing package without the trailing slash', () => {
    expect(missingPackages).to.include('events');
    expect(missingPackages).to.not.include('events/');
  });
});
