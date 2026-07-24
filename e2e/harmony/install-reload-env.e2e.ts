import { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit install when a plugin env fails to reload', function () {
  this.timeout(0);
  let helper: Helper;
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('a plugin env whose plugin file throws on require', () => {
    before(() => {
      helper = new Helper();
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.env.setEmptyEnv();
      helper.fixtures.populateComponents(1);
      helper.command.setEnv('comp1', 'empty-env');
      helper.command.install();
      helper.fs.outputFile(
        'empty-env/empty-env.bit-env.ts',
        `throw new Error('intentional plugin failure');
export class EmptyEnv {}
export default new EmptyEnv();
`
      );
      helper.command.compile();
    });
    // the env reload during install is best-effort. a broken env must not fail the install -
    // the user needs "bit install" to work in order to fix the env
    it('should warn about the env reload failure without failing the install', () => {
      const output = helper.command.install();
      expect(output).to.have.string('unable to reload the env');
      expect(output).to.have.string('Successfully');
    });
    // the failure is degraded to a warning, not swallowed - the env keeps being reported as
    // non-loaded after the install
    it('should still report the failed env as a component issue', () => {
      helper.command.expectStatusToHaveIssue(IssuesClasses.NonLoadedEnv.name);
    });
  });
});
