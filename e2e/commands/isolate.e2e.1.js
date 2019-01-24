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
      helper.createFile('utils', 'is-type.js', isTypeFixture);
      helper.addComponentUtilsIsType();

      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();

      const fooBarFixture =
        "const isString = require('../utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.createFile('bar', 'foo.js', fooBarFixture);
      helper.addComponentBarFoo();

      helper.tagAllComponents();
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
