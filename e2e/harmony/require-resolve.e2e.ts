import chai, { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';
chai.use(chaiFs);
chai.use(chaiString);

describe('require.resolve detection', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('when a dependency is inside require.resolve statement', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(
        'comp1/babel.config.js',
        `module.exports = { plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] };`
      );
    });
    it('should detect it', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues[0].issues[0].type).to.equal(
        IssuesClasses.MissingPackagesDependenciesOnFs.name
      );
      expect(status.componentsWithIssues[0].issues[0].data[0].missingPackages[0]).to.equal(
        '@babel/plugin-transform-modules-commonjs'
      );
    });
  });
});
