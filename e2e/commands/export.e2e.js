// covers also init, commit, add and import commands

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper, { VERSION_DELIMITER } from '../e2e-helper';

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
  describe('of one component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
    });
    it('should not write the exported component into bit.json', () => {
      const bitJson = helper.readBitJson();
      expect(bitJson.dependencies).not.to.have.property(`${helper.remoteScope}/bar/foo`);
    });
    it('should write the exported component into bit.map', () => {
      const bitMap = helper.readBitMap();
      expect(bitMap).to.have.property(`${helper.remoteScope}/bar/foo${VERSION_DELIMITER}1`);
    });
  });
  describe('with multiple components, each has one file', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      createComponent('bar', 'foo1');
      createComponent('bar', 'foo2');
      createComponent('baz', 'foo1');
      createComponent('baz', 'foo2');
      helper.runCmd('bit add bar/foo1.js');
      helper.runCmd('bit add bar/foo2.js');
      helper.runCmd('bit add baz/foo1.js');
      helper.runCmd('bit add baz/foo2.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    it('should export them all', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope}`);
      expect(output.includes('found 4 components')).to.be.true;
      expect(output.includes('baz/foo1')).to.be.true;
      expect(output.includes('baz/foo2')).to.be.true;
      expect(output.includes('bar/foo1')).to.be.true;
      expect(output.includes('bar/foo2')).to.be.true;
    });
  });

  describe('with multiple components, each has multiple files', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      createComponent('bar', 'foo1');
      createComponent('bar', 'foo2');
      createComponent('baz', 'foo1');
      createComponent('baz', 'foo2');
      helper.runCmd('bit add bar -m foo1.js');
      helper.runCmd('bit add baz -m foo1.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    it('should export them all', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope} --bare`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('bar')).to.be.true;
      expect(output.includes('baz')).to.be.true;
    });
  });

  describe('with specifying multiple components in the CLI', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      createComponent('bar', 'foo1');
      createComponent('bar', 'foo2');
      helper.runCmd('bit add bar/foo1.js');
      helper.runCmd('bit add bar/foo2.js');
      helper.commitAllComponents();
      helper.exportComponent('bar/foo1 bar/foo2');
    });
    it('should export them all', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope} --bare`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('bar/foo1')).to.be.true;
      expect(output.includes('bar/foo2')).to.be.true;
    });
    it('bit list locally should display 2 components', () => {
      const output = helper.runCmd('bit list');
      expect(output.includes('found 2 components in local scope')).to.be.true;
    });
  });

  describe('with dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      helper.exportComponent('utils/is-type');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitComponent('utils/is-string');
      helper.exportComponent('utils/is-string');
    });
    it('should export them successfully', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope}`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('utils/is-type')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
  });

  describe('with dependencies and export-all', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitComponent('utils/is-string');
      helper.exportAllComponents();
    });
    it('should export them all', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope}`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('utils/is-type')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
  });
  describe('with no components to export', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
    });
    it('should print nothing to export', () => {
      const output = helper.exportAllComponents();
      expect(output).to.include('nothing to export');
    });
  });
  describe('with multiple versions', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      helper.commitComponent('bar/foo -f');
      helper.exportComponent('bar/foo');
    });
    it('should export it with no errors', () => {
      const output = helper.runCmd(`bit list ${helper.remoteScope}`);
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
      expect(output.includes('2')).to.be.true; // this is the version
    });
  });

  describe('imported (v1), exported (v2) and then exported again (v3)', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo'); // v1

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');

      helper.createFile(path.join('components', 'bar', 'foo', 'bar'), 'foo.js', 'console.log("got foo v2")');
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo'); // v2

      helper.createFile(path.join('components', 'bar', 'foo', 'bar'), 'foo.js', 'console.log("got foo v3")');
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo'); // v3
    });
    it('should export it with no errors', () => {
      const output = helper.listRemoteScope();
      expect(output.includes(`${helper.remoteScope}/bar/foo@3`)).to.be.true;
    });
  });

  describe('after import with dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('utils/is-string');
      helper.commitComponent(`${helper.remoteScope}/utils/is-string -f`);
      helper.exportComponent(`${helper.remoteScope}/utils/is-string`);
    });

    it('should export it successfully', () => {
      const output = helper.listRemoteScope();
      expect(output.includes('utils/is-string@2')).to.be.true;
    });
  });

  describe('with dependencies on a different scope', () => {
    let anotherScope;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitComponent('utils/is-type');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitComponent('utils/is-string');
      helper.exportComponent('utils/is-type');

      const { scopeName, scopePath } = helper.getNewBareScope();
      anotherScope = scopeName;
      helper.addRemoteScope(scopePath);
      helper.exportComponent('utils/is-string', scopeName);
    });
    it('should fetch the dependency from a different scope and successfully export the component', () => {
      const output = helper.runCmd(`bit list ${anotherScope}`);
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
  });

  describe('exporting version 3 of a component after importing version 2', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo(); // v1
      helper.commitComponent('bar/foo -f'); // v2
      helper.exportComponent('bar/foo');

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');

      helper.commitComponentBarFoo(); // v3
      helper.exportComponent(`${helper.remoteScope}/bar/foo`);
    });
    it('should export it with no errors', () => {
      const output = helper.listRemoteScope();
      expect(output.includes(`${helper.remoteScope}/bar/foo@3`)).to.be.true;
    });
  });

  describe('exporting version 3 of a component as an author', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponent('bar', 'foo.js', 'console.log("got foo v1")');
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo(); // v1
      helper.exportComponent('bar/foo');

      helper.createComponent('bar', 'foo.js', 'console.log("got foo v2")');
      helper.commitComponentBarFoo(); // v2
      helper.exportComponent('bar/foo');

      helper.createComponent('bar', 'foo.js', 'console.log("got foo v3")');
      helper.commitComponentBarFoo(); // v3
      helper.exportComponent('bar/foo');
    });
    it('should export it with no errors', () => {
      const output = helper.listRemoteScope();
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
      expect(output.includes('3')).to.be.true; // this is the version
    });
  });

  describe('with a PNG file', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      const destPngFile = path.join(helper.localScopePath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.runCmd('bit add bar -m foo.js -i bar/foo');
      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    it('should export it with no errors', () => {
      const output = helper.listRemoteScope();
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
  });

  describe('export a component, do not modify it and export again to the same scope', () => {
    let output;
    let errorOutput;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.exportComponent('bar/foo');
      try {
        output = helper.exportComponent('bar/foo');
      } catch (err) {
        errorOutput = err.message;
      }
    });
    it('should not export the component', () => {
      expect(output).to.be.undefined;
    });
    it('should throw an error saying the component was already exported', () => {
      expect(errorOutput.includes('has been already exported')).to.be.true;
    });
  });
});
