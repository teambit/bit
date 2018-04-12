import { expect } from 'chai';
import Helper from '../e2e-helper';
import { MergeConflict, MergeConflictOnRemote } from '../../src/scope/exceptions';

const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
const isStringFixture =
  "const isType = require('./is-type.js'); module.exports = function isString() { return isType()   ' and got is-string'; };";

describe('merge functionality', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('re-exporting/importing an existing version', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();

      helper.createFile('bar2', 'foo2.js');
      helper.addComponent('bar2/foo2.js');
      helper.commitComponent('bar2/foo2');

      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      helper.importComponent('bar2/foo2');
      const scopeWithV1 = helper.cloneLocalScope();
      helper.commitComponent('bar/foo', 'msg', '-f');
      helper.commitComponent('bar2/foo2', 'msg', '-f');
      helper.exportAllComponents(); // v2 is exported

      helper.getClonedLocalScope(scopeWithV1);
      helper.commitComponent('bar/foo', 'msg', '-f');
      helper.commitComponent('bar2/foo2', 'msg', '-f');
    });
    it('should throw MergeConflictOnRemote error when exporting the component', () => {
      const exportFunc = () => helper.exportAllComponents(); // v2 is exported again
      const idsAndVersions = [
        { id: `${helper.remoteScope}/bar/foo`, versions: ['0.0.2'] },
        { id: `${helper.remoteScope}/bar2/foo2`, versions: ['0.0.2'] }
      ];
      const error = new MergeConflictOnRemote(idsAndVersions);
      helper.expectToThrow(exportFunc, error);
    });
    it('should throw MergeConflict error when importing the component', () => {
      const importFunc = () => helper.importComponent('bar/foo');
      const error = new MergeConflict(`${helper.remoteScope}/bar/foo`, ['0.0.2']);
      helper.expectToThrow(importFunc, error);
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
