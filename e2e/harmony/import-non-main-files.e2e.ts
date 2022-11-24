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
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.populateComponents(2, false);
      helper.fs.outputFile('comp2/non-main.js', 'export function nonMain(){}');
      helper.fs.outputFile('comp1/index.js', `import { nonMain } from '@${helper.scopes.remote}/comp2/non-main';`);
      helper.command.link();
    });
    it('bit status should show it as an invalid component', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues).to.have.lengthOf(1);
      helper.command.statusComponentHasIssues('comp1');
    });
    it('bit status should print the path for the non-main file', () => {
      const status = helper.command.status();
      expect(status).to.have.string(`index.js -> @${helper.scopes.remote}/comp2/non-main.js`);
      helper.command.expectStatusToHaveIssue(IssuesClasses.ImportNonMainFiles.name);
    });
  });
  describe('importing from a main file when the dependency was not compiled yet', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.populateComponents(2, true, undefined, false);
      helper.command.compile('comp1');
    });
    // a previous bug showed the non-main issue because the dependency resolved to the source
    // instead of the dist
    it('should not show the import-non-main-file issue', () => {
      helper.command.expectStatusToNotHaveIssue(IssuesClasses.ImportNonMainFiles.name);
    });
  });
  describe('importing of a non-main json file (or any not .js(x)/.ts(x) file)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.populateComponents(2, false);
      helper.fs.outputFile('comp2/non-main.json', '{}');
      helper.fs.outputFile('comp1/index.js', `import nonMain from '@${helper.scopes.remote}/comp2/non-main.json';`);
      helper.command.link();
    });
    it('bit status should not show it as an invalid component', () => {
      const status = helper.command.statusJson();
      expect(status.componentsWithIssues).to.have.lengthOf(0);
    });
  });
});
