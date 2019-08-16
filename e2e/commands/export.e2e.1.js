import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper, { VERSION_DELIMITER } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';

describe('bit export command', function () {
  this.timeout(0);
  const helper = new Helper();
  const createFile = (dir, name) => {
    const componentFixture = `module.exports = function foo() { return 'got ${name}'; };`;
    fs.outputFileSync(path.join(helper.scopes.localScopePath, dir, `${name}.js`), componentFixture);
  };
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('of one component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
    });
    it('should write the exported component into bit.map', () => {
      const bitMap = helper.bitMap.readBitMap();
      expect(bitMap).to.have.property(`${helper.scopes.remoteScope}/bar/foo${VERSION_DELIMITER}0.0.1`);
    });
  });
  describe('with multiple components, each has one file', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      createFile('bar', 'foo1');
      createFile('bar', 'foo2');
      createFile('baz', 'foo1');
      createFile('baz', 'foo2');
      helper.command.addComponent('bar/foo1.js', { i: 'bar/foo1' });
      helper.command.addComponent('bar/foo2.js', { i: 'bar/foo2' });
      helper.command.addComponent('baz/foo1.js', { i: 'baz/foo1' });
      helper.command.addComponent('baz/foo2.js', { i: 'baz/foo2' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should export them all', () => {
      const output = helper.command.runCmd(`bit list ${helper.scopes.remoteScope}`);
      expect(output.includes('found 4 components')).to.be.true;
      expect(output.includes('baz/foo1')).to.be.true;
      expect(output.includes('baz/foo2')).to.be.true;
      expect(output.includes('bar/foo1')).to.be.true;
      expect(output.includes('bar/foo2')).to.be.true;
    });
  });

  describe('with multiple components, each has multiple files', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      createFile('bar', 'foo1');
      createFile('bar', 'foo2');
      createFile('baz', 'foo1');
      createFile('baz', 'foo2');
      helper.command.runCmd('bit add bar -m foo1.js');
      helper.command.runCmd('bit add baz -m foo1.js');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should export them all', () => {
      const output = helper.command.runCmd(`bit list ${helper.scopes.remoteScope} --raw`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('bar')).to.be.true;
      expect(output.includes('baz')).to.be.true;
    });
  });

  describe('with specifying multiple components in the CLI', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      createFile('bar', 'foo1');
      createFile('bar', 'foo2');
      helper.command.addComponent('bit add bar/foo1.js', { i: 'bar/foo1' });
      helper.command.addComponent('bit add bar/foo2.js', { i: 'bar/foo2' });
      helper.command.tagAllComponents();
      // DO NOT change the next line to `helper.command.exportAllComponents()`. the current form catches some wierd bugs
      helper.command.exportComponent('bar/foo1 bar/foo2');
    });
    it('should export them all', () => {
      const output = helper.command.runCmd(`bit list ${helper.scopes.remoteScope} --raw`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('bar/foo1')).to.be.true;
      expect(output.includes('bar/foo2')).to.be.true;
    });
    it('bit list locally should display 2 components', () => {
      const output = helper.command.listLocalScope();
      expect(output.includes('found 2 components in local scope')).to.be.true;
    });
  });

  describe('with dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixture);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagComponent('utils/is-type');
      helper.command.exportComponent('utils/is-type');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagComponent('utils/is-string');
      helper.command.exportComponent('utils/is-string');
    });
    it('should export them successfully', () => {
      const output = helper.command.runCmd(`bit list ${helper.scopes.remoteScope}`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('utils/is-type')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
  });

  describe('with dependencies and export-all', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixture);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagComponent('utils/is-type');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagComponent('utils/is-string');
      helper.command.exportAllComponents();
    });
    it('should export them all', () => {
      const output = helper.command.runCmd(`bit list ${helper.scopes.remoteScope}`);
      expect(output.includes('found 2 components')).to.be.true;
      expect(output.includes('utils/is-type')).to.be.true;
      expect(output.includes('utils/is-string')).to.be.true;
    });
  });
  describe('with no components to export', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
    });
    it('should print nothing to export', () => {
      const output = helper.command.exportAllComponents();
      expect(output).to.include('nothing to export');
    });
  });
  describe('with multiple versions', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      helper.command.tagComponent('bar/foo -f');
      helper.command.exportComponent('bar/foo');
    });
    it('should export it with no errors', () => {
      const output = helper.command.runCmd(`bit list ${helper.scopes.remoteScope}`);
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
      expect(output.includes('2')).to.be.true; // this is the version
    });
  });

  describe('imported (v1), exported (v2) and then exported again (v3)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo'); // v1

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');

      helper.fs.createFile(path.join('components', 'bar', 'foo'), 'foo.js', 'console.log("got foo v2")');
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo'); // v2

      helper.fs.createFile(path.join('components', 'bar', 'foo'), 'foo.js', 'console.log("got foo v3")');
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo'); // v3
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope();
      expect(output.includes(`${helper.scopes.remoteScope}/bar/foo@0.0.3`)).to.be.true;
    });
  });

  describe('after import with dependencies', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixture);
      helper.fixtures.addComponentUtilsIsType();
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
      helper.command.tagComponent(`${helper.scopes.remoteScope}/utils/is-string -f`);
      helper.command.exportComponent(`${helper.scopes.remoteScope}/utils/is-string`);
    });

    it('should export it successfully', () => {
      const output = helper.command.listRemoteScope();
      expect(output.includes('utils/is-string@0.0.2')).to.be.true;
    });
  });

  describe('with dependencies on a different scope', () => {
    let anotherScope;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.fs.createFile('utils', 'is-type.js', isTypeFixture);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagComponent('utils/is-type');
      const isStringFixture =
        "const isType = require('./is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      helper.command.tagComponent('utils/is-string');
      helper.command.exportComponent('utils/is-type');

      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherScope = scopeName;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.exportComponent('utils/is-string', scopeName);
    });
    it('should fetch the dependency from a different scope and successfully export the component', () => {
      const output = helper.command.runCmd(`bit list ${anotherScope}`);
      expect(output).to.have.string('utils/is-string');
      // this is a test for bit-list, it makes sure bit-list of remote-scope doesn't show
      // components from a different scope. here, it should not show is-type
      expect(output).to.not.have.string('utils/is-type');
      expect(output).to.have.string('found 1 components');
    });
  });

  describe('exporting version 3 of a component after importing version 2', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo(); // v1
      helper.command.tagComponent('bar/foo -f'); // v2
      helper.command.exportComponent('bar/foo');

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');

      helper.command.tagComponent('bar/foo -f'); // v3
      helper.command.exportComponent(`${helper.scopes.remoteScope}/bar/foo`);
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope();
      expect(output).to.have.string(`${helper.scopes.remoteScope}/bar/foo@0.0.3`);
    });
  });

  describe('exporting version 3 of a component as an author', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('bar', 'foo.js', 'console.log("got foo v1")');
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo(); // v1
      helper.command.exportComponent('bar/foo');

      helper.fs.createFile('bar', 'foo.js', 'console.log("got foo v2")');
      helper.fixtures.tagComponentBarFoo(); // v2
      helper.command.exportComponent('bar/foo');

      helper.fs.createFile('bar', 'foo.js', 'console.log("got foo v3")');
      helper.fixtures.tagComponentBarFoo(); // v3
      helper.command.exportComponent('bar/foo');
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope();
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
      expect(output.includes('3')).to.be.true; // this is the version
    });
  });

  describe('with a PNG file', () => {
    let pngSize;
    let destPngFile;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localScopePath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const stats = fs.statSync(destPngFile);
      pngSize = stats.size;
      helper.command.runCmd('bit add bar -m foo.js -i bar/foo');
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope();
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    describe('after importing the file', () => {
      before(() => {
        helper.command.importComponent('bar/foo');
      });
      it('the size of the binary file should not be changed', () => {
        const currentStats = fs.statSync(destPngFile);
        const currentSize = currentStats.size;
        expect(currentSize).to.equal(pngSize);
      });
    });
  });

  describe('export a component, do not modify it and export again to the same scope', () => {
    let output;
    let errorOutput;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportComponent('bar/foo');
      try {
        output = helper.command.exportComponent('bar/foo', undefined, false);
      } catch (err) {
        errorOutput = err.message;
      }
    });
    it('should not export the component', () => {
      expect(output).to.be.undefined;
    });
    it('should throw an error saying the component was already exported', () => {
      expect(errorOutput).to.have.string('has been already exported');
    });
  });

  describe('remote scope with is-string2 and a dependency is-type with version 0.0.2 only', () => {
    let output;
    let remote2;
    let remote2Path;
    before(() => {
      // step1: export is-type and is-string1 both 0.0.1 to remote1
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fs.createFile('utils', 'is-string1.js', fixtures.isString);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.addComponent('utils/is-string1.js', { i: 'utils/is-string1' });
      helper.command.tagAllComponents('', '0.0.1');
      helper.command.exportAllComponents();

      // step2: export is-type@0.0.2 and is-string2 to remote1
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-type');
      helper.command.tagComponent('utils/is-type', undefined, '0.0.2 --force');
      helper.command.exportAllComponents();
      const isType = helper.general.getRequireBitPath('utils', 'is-type');
      helper.fs.createFile(
        'utils',
        'is-string2.js',
        `const isType = require('${isType}'); module.exports = function isString() { return isType() +  ' and got is-string'; };`
      );
      helper.command.addComponent('utils/is-string2.js', { i: 'utils/is-string2' });
      const bitShowOutput = helper.command.showComponentParsed('utils/is-string2');
      expect(bitShowOutput.dependencies[0].id).to.have.string('utils/is-type@0.0.2');
      helper.command.tagComponent('utils/is-string2');
      helper.command.exportAllComponents();

      // step3: export is-string2 to remote2, so then it will have only the 0.0.2 version of the is-type dependency
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      remote2 = scopeName;
      remote2Path = scopePath;
      helper.scopeHelper.addRemoteScope(scopePath);
      helper.command.exportComponent('utils/is-string2', remote2);
    });
    it('should have is-type@0.0.2 on that remote', () => {
      const isType = helper.command.catComponent(`${helper.scopes.remoteScope}/utils/is-type@0.0.2`, remote2Path);
      expect(isType).to.have.property('files');
    });
    it('should not have is-type@0.0.1 on that remote', () => {
      let isType;
      try {
        isType = helper.command.catComponent(`${helper.scopes.remoteScope}/utils/is-type@0.0.1`, remote2Path);
      } catch (err) {
        isType = err.toString();
      }
      expect(isType).to.have.string('component was not found');
    });
    describe('export a component is-string1 with a dependency is-type of version 0.0.1', () => {
      before(() => {
        helper.command.importComponent('utils/is-string1');
        output = helper.command.exportComponent('utils/is-string1', remote2);
      });
      it('should not throw an error saying it does not have the version 0.0.1 of the dependency', () => {
        expect(output).to.not.have.string('failed loading version 0.0.1');
      });
      it('should show a successful message', () => {
        expect(output).to.have.string('exported 1 components to scope');
      });
      it('should fetch is-type@0.0.1 from remote1', () => {
        const isType = helper.command.catComponent(`${helper.scopes.remoteScope}/utils/is-type@0.0.1`, remote2Path);
        expect(isType).to.have.property('files');
      });
    });
  });

  describe('export a component when the checked out version is not the latest', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo('// v2');
      helper.fixtures.addComponentBarFoo();
      helper.command.tagScope('2.0.0');
      helper.command.exportAllComponents();
      helper.fixtures.createComponentBarFoo('// v1');
      helper.command.tagScope('1.0.0');
      helper.command.exportAllComponents();
    });
    it('.bitmap should keep the current version and do not update to the latest version', () => {
      const bitMap = helper.bitMap.readBitMap();
      expect(bitMap).to.have.property(`${helper.scopes.remoteScope}/bar/foo@1.0.0`);
      expect(bitMap).to.not.have.property(`${helper.scopes.remoteScope}/bar/foo@2.0.0`);
    });
    it('bit show should display the component with the current version, not the latest', () => {
      const show = helper.command.showComponent('bar/foo');
      expect(show).to.have.string('1.0.0');
      expect(show).to.not.have.string('2.0.0');
    });
    it('the file content should not be changed', () => {
      const barFooFile = helper.fs.readFile('bar/foo.js');
      expect(barFooFile).to.equal('// v1');
    });
  });
  describe('applying permissions on the remote scope when was init with shared flag', () => {
    const isWin = process.platform === 'win32';
    let scopeBeforeExport;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      fs.emptyDirSync(helper.scopes.remoteScopePath);
      helper.command.runCmd('bit init --bare --shared nonExistGroup', helper.scopes.remoteScopePath);
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      scopeBeforeExport = helper.scopeHelper.cloneLocalScope();
    });
    describe('when the group name does not exist', () => {
      before(() => {
        fs.emptyDirSync(helper.scopes.remoteScopePath);
        helper.command.runCmd('bit init --bare --shared nonExistGroup', helper.scopes.remoteScopePath);
        helper.scopeHelper.addRemoteScope();
      });
      it('should throw an error indicating that the group does not exist (unless it is Windows)', () => {
        const output = helper.general.runWithTryCatch(`bit export ${helper.scopes.remoteScope}`);
        if (isWin) {
          expect(output).to.have.string('exported 1 components');
        } else {
          expect(output).to.have.string('unable to resolve group id of "nonExistGroup", the group does not exist');
        }
      });
    });
    describe('when the group exists and the current user has permission to that group', function () {
      if (isWin || process.env.npm_config_with_ssh) {
        this.skip;
      } else {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(scopeBeforeExport);
          fs.emptyDirSync(helper.scopes.remoteScopePath);
          const currentGroup = helper.command.runCmd('id -gn');
          helper.command.runCmd(`bit init --bare --shared ${currentGroup}`, helper.scopes.remoteScopePath);
          helper.scopeHelper.addRemoteScope();
        });
        it('should export the component successfully and change the owner to that group', () => {
          const output = helper.command.exportAllComponents();
          expect(output).to.have.string('exported 1 components');
        });
      }
    });
  });
});
