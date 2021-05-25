import { IssuesClasses } from '@teambit/component-issues';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('status command on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('main filename is not index and dists are missing', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fs.outputFile('comp1/comp1.ts', "require('@my-scope/comp2');");
      helper.fs.outputFile('comp2/comp2.ts');
      helper.command.addComponent('comp1');
      helper.command.addComponent('comp2');
      helper.command.link();
    });
    it('should not show an issue of missing-packages', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.MissingPackagesDependenciesOnFs.name);
    });
  });
});
