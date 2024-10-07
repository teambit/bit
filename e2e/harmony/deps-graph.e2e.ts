import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('dependencies graph data', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe.only('single component', () => {
    before(async () => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile(`comp1/index.js`, `const React = require("react")`);
      helper.command.install('react@18.3.1');
      helper.command.snapAllComponents();
    });
    it('should save dependencies graph to the model', () => {
      const versionObj = helper.command.catComponent('comp1@latest');
      const depsGraph = JSON.parse(helper.command.catObject(versionObj.dependenciesGraphRef));
      expect(depsGraph.importers['.'].dependencies.react).to.eq('18.3.1');
      console.log(JSON.stringify(depsGraph, null, 2));
    });
  });
});
