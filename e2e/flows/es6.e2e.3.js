import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('es6 components', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('component that requires multiple variables from another component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'index.js', 'export function isType() {}; export function isString() {};');
      helper.createFile('bar', 'foo.js', 'import { isType, isString } from "../utils";');
      helper.addComponent('utils/index.js');
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    it('the generated dependency link should not have duplicates', () => {
      const dependencyLink = helper.readFile('components/bar/foo/utils/index.js');
      const requireStatement = `require('@bit/${helper.remoteScope}.index');`;
      const numOfOccurrences = dependencyLink.split(requireStatement).length - 1;
      expect(numOfOccurrences).to.equal(1);
    });
  });
});
