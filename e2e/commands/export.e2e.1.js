import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper, { VERSION_DELIMITER } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import { CURRENT_UPSTREAM } from '../../src/constants';

describe('bit export command', function () {
  this.timeout(0);
  const helper = new Helper();
  const createFile = (dir, name) => {
    const componentFixture = `module.exports = function foo() { return 'got ${name}'; };`;
    fs.outputFileSync(path.join(helper.scopes.localPath, dir, `${name}.js`), componentFixture);
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
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo${VERSION_DELIMITER}0.0.1`);
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
      const output = helper.command.runCmd(`bit list ${helper.scopes.remote}`);
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
      const output = helper.command.runCmd(`bit list ${helper.scopes.remote} --raw`);
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
      const output = helper.command.runCmd(`bit list ${helper.scopes.remote} --raw`);
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
      const output = helper.command.runCmd(`bit list ${helper.scopes.remote}`);
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
      const output = helper.command.runCmd(`bit list ${helper.scopes.remote}`);
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
      const output = helper.command.runCmd(`bit list ${helper.scopes.remote}`);
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
      expect(output.includes(`${helper.scopes.remote}/bar/foo@0.0.3`)).to.be.true;
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
      helper.command.tagComponent(`${helper.scopes.remote}/utils/is-string -f`);
      helper.command.exportComponent(`${helper.scopes.remote}/utils/is-string`);
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
      helper.command.exportComponent(`${helper.scopes.remote}/bar/foo`);
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope();
      expect(output).to.have.string(`${helper.scopes.remote}/bar/foo@0.0.3`);
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
      destPngFile = path.join(helper.scopes.localPath, 'bar', 'png_fixture.png');
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
      const isType = helper.command.catComponent(`${helper.scopes.remote}/utils/is-type@0.0.2`, remote2Path);
      expect(isType).to.have.property('files');
    });
    it('should not have is-type@0.0.1 on that remote', () => {
      let isType;
      try {
        isType = helper.command.catComponent(`${helper.scopes.remote}/utils/is-type@0.0.1`, remote2Path);
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
        const isType = helper.command.catComponent(`${helper.scopes.remote}/utils/is-type@0.0.1`, remote2Path);
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
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.have.property(`${helper.scopes.remote}/bar/foo@1.0.0`);
      expect(bitMap).to.not.have.property(`${helper.scopes.remote}/bar/foo@2.0.0`);
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
      fs.emptyDirSync(helper.scopes.remotePath);
      helper.command.runCmd('bit init --bare --shared nonExistGroup', helper.scopes.remotePath);
      helper.scopeHelper.addRemoteScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      scopeBeforeExport = helper.scopeHelper.cloneLocalScope();
    });
    describe('when the group name does not exist', () => {
      before(() => {
        fs.emptyDirSync(helper.scopes.remotePath);
        helper.command.runCmd('bit init --bare --shared nonExistGroup', helper.scopes.remotePath);
        helper.scopeHelper.addRemoteScope();
      });
      it('should throw an error indicating that the group does not exist (unless it is Windows)', () => {
        const output = helper.general.runWithTryCatch(`bit export ${helper.scopes.remote}`);
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
          fs.emptyDirSync(helper.scopes.remotePath);
          const currentGroup = helper.command.runCmd('id -gn');
          helper.command.runCmd(`bit init --bare --shared ${currentGroup}`, helper.scopes.remotePath);
          helper.scopeHelper.addRemoteScope();
        });
        it('should export the component successfully and change the owner to that group', () => {
          const output = helper.command.exportAllComponents();
          expect(output).to.have.string('exported 1 components');
        });
      }
    });
  });
  describe('export a component where the require id in the dist files are without a scope-name', () => {
    let distContent;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.outputFile('bar.js', 'require("./bar-dep")');
      helper.fs.outputFile('bar-dep.js');
      helper.command.addComponent('bar.js');
      helper.command.addComponent('bar-dep.js');
      helper.env.importDummyCompiler('add-scope-name');
      helper.command.tagAllComponents();

      // an intermediate step, make sure the compiler wrote the dist with two packages.
      // one with the same name as the dependency id.
      // second with a non-exist id. (which expected not to be changed later)
      const distFile = helper.fs.readFile('dist/bar.js');
      expect(distFile).to.have.string('require("@bit/bar-dep");');
      expect(distFile).to.have.string('require("@bit/bar-non-exist");');

      helper.command.exportAllComponents();
      const bar = helper.command.catComponent('bar@latest');
      const distObject = bar.dists[0].file;
      distContent = helper.command.catObject(distObject);
    });
    it('should replace the ids without scope name to ids with scope name upon export', () => {
      expect(distContent).to.have.string(`"@bit/${helper.scopes.remote}.bar-dep"`);
    });
    it('should not replace other ids that only has the prefix of other ids/deps', () => {
      expect(distContent).to.not.have.string(`"@bit/${helper.scopes.remote}.bar-non-exist"`);
    });
    it('should replace the ids without scope name to ids with scope name even when it points to an internal file', () => {
      expect(distContent).to.have.string(`"@bit/${helper.scopes.remote}.bar-dep/internal-path"`);
    });
  });
  describe('without specifying a remote', () => {
    describe('some components are new and some are tagged', () => {
      let localScopeBefore;
      let remoteScopeBefore;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fs.outputFile('foo1.js');
        helper.fs.outputFile('foo2.js');
        helper.command.addComponent('foo1.js');
        helper.command.addComponent('foo2.js');
        helper.command.tagAllComponents();
        helper.command.exportComponent('foo1');
        helper.command.tagScope('1.0.0');
        localScopeBefore = helper.scopeHelper.cloneLocalScope();
        remoteScopeBefore = helper.scopeHelper.cloneRemoteScope();
      });
      describe(`export with id and "${CURRENT_UPSTREAM}" keyword`, () => {
        it('when the id has scope (were exported before), it should export it successfully', () => {
          const output = helper.command.exportToCurrentScope('foo1');
          expect(output).to.have.string('exported the following 1 component');
        });
        it('when the id does not have scope (it is new), it should show a warning', () => {
          const output = helper.command.exportToCurrentScope('foo2');
          expect(output).to.have.string('the following component(s) were not exported');
        });
      });
      describe('export with no ids, no remote and no flags', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          output = helper.command.runCmd('bit export');
        });
        it('should export successfully the id that has a scope (was exported before)', () => {
          expect(output).to.have.string('exported the following 1 component');
          const remoteList = helper.command.listRemoteScopeParsed();
          expect(remoteList).to.have.lengthOf(1);
          expect(remoteList[0].id).to.have.string('foo1');
        });
        it('should show a warning about ids with missing scope', () => {
          expect(output).to.have.string('the following component(s) were not exported');
          expect(output).to.have.string('foo2');
        });
      });
      describe('export with no remote and no flags when workspace config has defaultScope set', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.bitJson.addKeyVal(undefined, 'defaultScope', helper.scopes.remote);
          output = helper.command.runCmd('bit export');
        });
        it('should export successfully both, the id with and without the scope', () => {
          expect(output).to.have.string('exported the following 2 component');
          const remoteList = helper.command.listRemoteScopeParsed();
          expect(remoteList).to.have.lengthOf(2);
          expect(remoteList[0].id).to.have.string('foo1');
          expect(remoteList[1].id).to.have.string('foo2');
        });
        it('should not show a warning about ids with missing scope', () => {
          expect(output).to.not.have.string('the following component(s) were not exported');
        });
      });
    });
    describe('some components were exported to one scope and other to another scope', () => {
      let localScopeBefore;
      let remoteScopeBefore;
      let anotherRemote;
      let anotherRemotePath;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
        anotherRemote = scopeName;
        anotherRemotePath = scopePath;
        helper.scopeHelper.addRemoteScope(scopePath);
        helper.fs.outputFile('foo1.js');
        helper.fs.outputFile('foo2.js');
        helper.command.addComponent('foo1.js');
        helper.command.addComponent('foo2.js');
        helper.command.tagAllComponents();
        helper.command.exportComponent('foo1');
        helper.command.runCmd(`bit export ${anotherRemote} foo2`);
        helper.command.tagScope('2.0.0');
        localScopeBefore = helper.scopeHelper.cloneLocalScope();
        remoteScopeBefore = helper.scopeHelper.cloneRemoteScope();
      });
      describe('export with no ids, no remote and no flags', () => {
        let output;
        before(() => {
          output = helper.command.runCmd('bit export');
        });
        it('should export successfully all ids, each to its own remote', () => {
          const remoteList = helper.command.listRemoteScopeParsed();
          expect(remoteList).to.have.lengthOf(1);
          expect(remoteList[0].id).to.have.string('foo1');

          const anotherRemoteListJson = helper.command.runCmd(`bit list ${anotherRemote} --json`);
          const anotherRemoteList = JSON.parse(anotherRemoteListJson);
          expect(anotherRemoteList).to.have.lengthOf(1);
          expect(anotherRemoteList[0].id).to.have.string('foo2');
        });
        it('should output the exported component ids with their different remotes', () => {
          expect(output).to.have.string(`${helper.scopes.remote}/foo1`);
          expect(output).to.have.string(`${anotherRemote}/foo2`);
        });
      });
      describe('export with ids, no remote and the flag --last-scope', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.reInitRemoteScope(anotherRemotePath);
          output = helper.command.exportToCurrentScope('foo1 foo2');
        });
        it('should export successfully all ids, each to its own remote', () => {
          const remoteList = helper.command.listRemoteScopeParsed();
          expect(remoteList).to.have.lengthOf(1);
          expect(remoteList[0].id).to.have.string('foo1');

          const anotherRemoteListJson = helper.command.runCmd(`bit list ${anotherRemote} --json`);
          const anotherRemoteList = JSON.parse(anotherRemoteListJson);
          expect(anotherRemoteList).to.have.lengthOf(1);
          expect(anotherRemoteList[0].id).to.have.string('foo2');
        });
        it('should output the exported component ids with their different remotes', () => {
          expect(output).to.have.string(`${helper.scopes.remote}/foo1`);
          expect(output).to.have.string(`${anotherRemote}/foo2`);
        });
      });
      describe('adding one component as a dependency of the other', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.reInitRemoteScope(anotherRemotePath);
          helper.fs.outputFile('foo1.js', "require('./foo2');");
          helper.command.tagScope('3.0.0');
          helper.scopeHelper.addRemoteScope(anotherRemotePath, helper.scopes.remotePath);
          output = helper.general.runWithTryCatch('bit export');
        });
        // before, it was throwing an error "exportingIds.hasWithoutVersion is not a function"
        // this makes sure, it doesn't throw this error anymore.
        // @todo: currently, it throws an error about component-not-found, that's because it tries
        // to export the dependency and the dependent at the same time. If the dependent is
        // exported first, in the remote of the dependent it fails because it's not able to find
        // the dependency as it was not exported yet.
        it('should throw an error about component was not found', () => {
          expect(output).to.have.string('was not found');
        });
      });
    });
    describe('export to a different scope', () => {
      let forkScope;
      let forkScopePath;
      let localScope;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateWorkspaceWithComponents();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
        forkScope = scopeName;
        forkScopePath = scopePath;
        helper.scopeHelper.addRemoteScope(forkScopePath);
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      describe('with id and --include-dependencies flag', () => {
        let forkScopeIds;
        before(() => {
          helper.command.export(`${forkScope} utils/is-string --include-dependencies`);
          const forkScopeList = helper.command.listScopeParsed(forkScope);
          forkScopeIds = forkScopeList.map(c => c.id);
        });
        it('should fork the component', () => {
          expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-string`);
        });
        it('should fork the dependencies', () => {
          expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-type`);
        });
        it('should not fork other components', () => {
          expect(forkScopeIds).to.not.deep.include(`${forkScope}/bar/foo`);
        });
        it('bit show should display the remote details', () => {
          const show = helper.command.showComponentParsed('utils/is-string');
          expect(show)
            .to.have.property('scopesList')
            .with.lengthOf(2);
          expect(show.scopesList[0].name).to.equal(helper.scopes.remote);
          expect(show.scopesList[1].name).to.equal(forkScope);
        });
      });
      describe('export staged component without --set-current-scope', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.scopeHelper.reInitRemoteScope(forkScopePath);
          helper.command.tagScope('1.0.0');
          output = helper.command.export(`${forkScope} utils/is-type`);
        });
        it('should show a success message', () => {
          expect(output).to.have.string('exported 1 components');
        });
        it('should leave the component in "staged" stage', () => {
          expect(helper.command.statusComponentIsStaged(`${helper.scopes.remote}/utils/is-type`)).to.be.true;
        });
        it('should not change the scope name to the new remote', () => {
          const list = helper.command.listLocalScopeParsed();
          const ids = list.map(i => i.id);
          expect(ids).to.include(`${helper.scopes.remote}/utils/is-type`);
          expect(ids).to.not.include(`${forkScope}/utils/is-type`);
        });
        it('should not change the component scope in the .bitmap file', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.have.property(`${helper.scopes.remote}/utils/is-type@1.0.0`);
          expect(bitMap).to.not.have.property(`${forkScope}/utils/is-type@1.0.0`);
        });
        it('should save all remotes in the objects', () => {
          const isType = helper.command.catComponent('utils/is-type');
          expect(isType)
            .to.have.property('remotes')
            .that.have.lengthOf(2);
          expect(isType.remotes[0].name).to.equal(helper.scopes.remote);
          expect(isType.remotes[1].name).to.equal(forkScope);
        });
      });
      describe('export staged component with --set-current-scope', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.scopeHelper.reInitRemoteScope(forkScopePath);
          helper.command.tagScope('1.0.0');
          output = helper.command.export(`${forkScope} utils/is-type --set-current-scope`);
        });
        it('should show a success message', () => {
          expect(output).to.have.string('exported 1 components');
        });
        it('should not leave the component in "staged" stage', () => {
          expect(helper.command.statusComponentIsStaged(`${helper.scopes.remote}/utils/is-type`)).to.be.false;
        });
        it('should change the scope name to the new remote', () => {
          const list = helper.command.listLocalScopeParsed();
          const ids = list.map(i => i.id);
          expect(ids).to.not.include(`${helper.scopes.remote}/utils/is-type`);
          expect(ids).to.include(`${forkScope}/utils/is-type`);
        });
        it('should change the component scope in the .bitmap file', () => {
          const bitMap = helper.bitMap.read();
          expect(bitMap).to.not.have.property(`${helper.scopes.remote}/utils/is-type@1.0.0`);
          expect(bitMap).to.have.property(`${forkScope}/utils/is-type@1.0.0`);
        });
        it('should save all remotes in the objects', () => {
          const isType = helper.command.catComponent('utils/is-type');
          expect(isType)
            .to.have.property('remotes')
            .that.have.lengthOf(2);
          expect(isType.remotes[0].name).to.equal(helper.scopes.remote);
          expect(isType.remotes[1].name).to.equal(forkScope);
        });
      });
      describe('export all with/without --force flag', () => {
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.scopeHelper.reInitRemoteScope(forkScopePath);
          helper.command.tagScope('1.0.0');
        });
        describe('without --force flag', () => {
          let output;
          before(() => {
            output = helper.general.runWithTryCatch(`bit export ${forkScope}`);
          });
          it('should throw an error warning about the scope change and suggesting to use --force', () => {
            expect(output).to.have.string('is about to change the scope');
            expect(output).to.have.string('please use "--force" flag');
          });
          it('should not export anything', () => {
            const remoteScope = helper.command.listScopeParsed(forkScope);
            expect(remoteScope).to.have.lengthOf(0);
          });
        });
        describe('with --force', () => {
          before(() => {
            helper.command.export(`${forkScope} --force`);
          });
          it('should export them all successfully', () => {
            const remoteScope = helper.command.listScopeParsed(forkScope);
            expect(remoteScope).to.have.lengthOf(3);
          });
        });
      });
      describe('workspace has some as staged and some as non-staged', () => {
        let localScopeWithFoo2;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScope);
          helper.scopeHelper.reInitRemoteScope(forkScopePath);
          helper.fs.outputFile('foo2.js');
          helper.command.addComponent('foo2.js');
          helper.command.tagComponent('foo2');
          localScopeWithFoo2 = helper.scopeHelper.cloneLocalScope();
        });
        describe('export without --all flag', () => {
          before(() => {
            helper.command.export(`${forkScope} --force`);
          });
          it('should export only the staged component', () => {
            const remoteScope = helper.command.listScopeParsed(forkScope);
            expect(remoteScope).to.have.lengthOf(1);
            expect(remoteScope[0].id).to.have.string('foo2');
          });
        });
        describe('export with --all flag', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScopeWithFoo2);
            helper.scopeHelper.reInitRemoteScope(forkScopePath);
            helper.command.export(`${forkScope} --force --all`);
          });
          it('should export all even non-staged components', () => {
            const remoteScope = helper.command.listScopeParsed(forkScope);
            expect(remoteScope).to.have.lengthOf(4);
          });
        });
      });
    });
  });
});
