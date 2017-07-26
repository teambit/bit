// covers also init, commit, add and import commands

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit export command', function () {
  this.timeout(0);
  const helper = new Helper();
  const createComponent = (dir, name) => {
    const componentFixture = `module.exports = function foo() { return 'got ${name}'; };`;
    fs.outputFileSync(path.join(helper.localScopePath, dir, `${name}.js`), componentFixture);
  };
  after(() => {
    helper.destroyEnv();
  });
  describe('with multiple components, each has one file', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      createComponent('bar', 'foo1');
      createComponent('bar', 'foo2');
      createComponent('baz', 'foo1');
      createComponent('baz', 'foo2');
      helper.runCmd('bit add bar/foo1.js');
      helper.runCmd('bit add bar/foo2.js');
      helper.runCmd('bit add baz/foo1.js');
      helper.runCmd('bit add baz/foo2.js');
      helper.runCmd('bit commit -a -m commit-msg');
      helper.runCmd('bit init --bare', helper.remoteScopePath);
      helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
      helper.exportComponent();
    });
    it('should export them all', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope}`);
      expect(output.includes('Total 4 components')).to.be.true;
      expect(output.includes('baz/foo1')).to.be.true;
      expect(output.includes('baz/foo2')).to.be.true;
      expect(output.includes('bar/foo1')).to.be.true;
      expect(output.includes('bar/foo2')).to.be.true;
    });
  });

  describe('with multiple components, each has multiple files', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
      createComponent('bar', 'foo1');
      createComponent('bar', 'foo2');
      createComponent('baz', 'foo1');
      createComponent('baz', 'foo2');
      helper.runCmd('bit add bar -m foo1.js');
      helper.runCmd('bit add baz -m foo1.js');
      helper.runCmd('bit commit -a -m commit-msg');
      helper.runCmd('bit init --bare', helper.remoteScopePath);
      helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
      helper.exportComponent();
    });
    it('should export them all', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope}`);
      expect(output.includes('Total 2 components')).to.be.true;
      expect(output.includes('bar')).to.be.true;
      expect(output.includes('baz')).to.be.true;
    });
  });

  describe('with dependencies', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      helper.exportComponent('utils/is-type');
      const isStringFixture = "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitComponent('utils/is-string');
      // helper.exportComponent('utils/is-string'); // todo: currently fails, will be fixed once we change all dependencies to the remote
    });
    it('should not fail (for now the before statement)', () => {

    });
  });
});
