import chai, { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';

const assertArrays = require('chai-arrays');

chai.use(assertArrays);

describe('run bit isolate', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  // TODO: Ipmlement! important! (there were conflicts during merge which not checked yet)
  // Validate each of the flags (espcially conf, dist, directory, noPackageJson)
  // Validate default flags
  describe('components with dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');

      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');

      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.createComponent('bar', 'foo.js', fooBarFixture);
      helper.addComponent('bar/foo.js');

      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    describe('with the same parameters as pack is using', () => {
      let isolatePath;
      before(() => {
        isolatePath = helper.isolateComponent('bar/foo', '-olw');
      });
      it('should be able to generate the links correctly and require the dependencies', () => {
        const appJsFixture = `const barFoo = require('./');
console.log(barFoo());`;
        fs.outputFileSync(path.join(isolatePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js', isolatePath);
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
  });
});
