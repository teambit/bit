import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';

describe('run bit install', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('importing a component with dependency and a package dependency', () => {
    let localScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.addNpmPackage('lodash.isstring', '4.0.0');
      const isStringFixture = `const lodashIsString = require('lodash.isstring');
module.exports = function isString() { return 'isString: ' + lodashIsString() +  ' and got is-string'; };`;
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      const requirePath = helper.getRequireBitPath('utils', 'is-string');
      const fooBarFixture = `const isString = require('${requirePath}/utils/is-string');
module.exports = function foo() { return isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.createComponent('bar', 'foo.js', fooBarFixture);
      helper.addComponent('bar/foo.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');

      helper.runCmd('npm install --save lodash.isboolean');
      const fooRequirePath = helper.getRequireBitPath('bar', 'foo');
      const appJsFixture = `const barFoo = require('${fooRequirePath}');
const isBoolean = require('lodash.isboolean');
console.log('isBoolean: ' + isBoolean(true) + ', ' + barFoo());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      localScope = helper.cloneLocalScope();
    });
    it('should print results from all dependencies (this is an intermediate check to make sure we are good so far)', () => {
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('isBoolean: true, isString: false and got is-string and got foo');
    });
    describe('cloning the project to somewhere else without the node-modules directories', () => {
      let output;
      before(() => {
        helper.mimicGitCloneLocalProject();
        output = helper.runCmd('bit install');
      });
      it('bit install should npm-install all missing node-modules and link all components', () => {
        expect(output).to.have.string('successfully ran npm install');
        expect(output).to.have.string('found 2 components');
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('isBoolean: true, isString: false and got is-string and got foo');
      });
    });
    describe('deleting node_modules of one component and running bit install [id]', () => {
      let output;
      before(() => {
        helper.getClonedLocalScope(localScope);
        fs.removeSync(path.join(helper.localScopePath, 'components/bar/foo/node_modules'));
        output = helper.runCmd('bit install bar/foo');
      });
      it('should npm install only the specified id', () => {
        expect(output).to.have.string('successfully ran npm install at components/bar/foo');
      });
      it('should link only the specified id', () => {
        expect(output).to.have.string('found 1 components');
      });
      it('all links should be in place', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('isBoolean: true, isString: false and got is-string and got foo');
      });
    });
  });
});
