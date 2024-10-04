import chai from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit export command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe.only('with multiple versions', () => {
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.command.install('--add-missing-deps');
      helper.command.snapAllComponents();
    });
    it('should export it with no errors', () => {
      const versionObj = helper.command.catComponent('comp1@latest');
      const depsGraph = helper.command.catObject(versionObj.dependenciesGraphRef);
      console.log(depsGraph);
    });
  });
});
