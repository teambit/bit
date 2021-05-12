import chai, { expect } from 'chai';
import { IssuesClasses } from '@teambit/component-issues';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('importing internal files flow (component imports from a non-index file of another component)', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('importing of a non-main .js file', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(2, false);
      helper.fs.outputFile('comp2/non-main.js', 'export function nonMain(){}');
      helper.fs.outputFile('comp1/index.js', `import { nonMain } from '@${helper.scopes.remote}/comp2/non-main';`);
      helper.command.link();
    });
    it('bit status should show it as an invalid component', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues).to.have.lengthOf(1);
      expect(status.componentsWithIssues[0].id).to.equal('comp1');
    });
    it('bit status should print the path for the non-main file', () => {
      const status = helper.command.status();
      expect(status).to.have.string(`index.js -> @${helper.scopes.remote}/comp2/non-main.js`);
      helper.command.expectStatusToHaveIssue(IssuesClasses.ImportNonMainFiles.name);
    });
  });
});
