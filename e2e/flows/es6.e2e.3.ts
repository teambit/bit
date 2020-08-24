import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('es6 components', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('component that requires multiple variables from another component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'index.js', 'export function isType() {}; export function isString() {};');
      helper.fs.createFile('bar', 'foo.js', 'import { isType, isString } from "../utils";');
      helper.command.addComponent('utils/index.js');
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('the generated dependency link should not have duplicates', () => {
      const dependencyLink = helper.fs.readFile('components/bar/foo/utils/index.js');
      const requireStatement = `require('@bit/${helper.scopes.remote}.index');`;
      const numOfOccurrences = dependencyLink.split(requireStatement).length - 1;
      expect(numOfOccurrences).to.equal(1);
    });
  });
});
