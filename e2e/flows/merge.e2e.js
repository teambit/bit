import { expect } from 'chai';
import Helper from '../e2e-helper';

const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
const isStringFixture =
  "const isType = require('./is-type.js'); module.exports = function isString() { return isType()   ' and got is-string'; };";

describe('merge functionality', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('re-exporting an existing version', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      const scopeWithV1 = helper.cloneLocalScope();
      helper.commitComponent('bar/foo', 'msg', '-f');
      helper.exportAllComponents(); // v2 is exported

      helper.getClonedLocalScope(scopeWithV1);
      helper.commitComponent('bar/foo', 'msg', '-f');
      try {
        output = helper.exportAllComponents(); // v2 is exported again
      } catch (e) {
        output = e.message;
      }
    });
    it('should throw merge-conflict error', () => {
      expect(output).to.have.string(
        `error: merge conflict occurred when exporting the component ${
          helper.remoteScope
        }/bar/foo.\nto resolve it, please import the latest version of the remote component, and apply your changes before exporting the component.\n`
      );
    });
  });

  describe('import an older version of a component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();

      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');

      helper.commitAllComponents();
      helper.exportAllComponents();
      const clonedScope = helper.cloneRemoteScope();

      const isTypeFixtureV2 = "module.exports = function isType() { return 'got is-type v2'; };";
      helper.createFile('utils', 'is-type.js', isTypeFixtureV2); // modify is-type
      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-type'); // v2

      helper.getClonedRemoteScope(clonedScope);
      helper.importComponent('utils/is-string'); // v1
    });
    it('the second import should not override the previously imported component', () => {
      const catScope = helper.catScope();
      const isTypeObject = catScope.find(c => c.name === 'is-type');
      expect(Object.keys(isTypeObject.versions).length).to.equal(2);
      expect(isTypeObject.versions).to.have.property('0.0.2');
    });
  });
});
