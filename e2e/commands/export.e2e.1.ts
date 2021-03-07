import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { CURRENT_UPSTREAM } from '../../src/constants';
import Helper, { VERSION_DELIMITER } from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';

chai.use(require('chai-fs'));

describe('bit export command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
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
      helper.command.addComponent('bar', { m: 'foo1.js' });
      helper.command.addComponent('baz', { m: 'foo1.js' });
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
      helper.command.addComponent('bar/foo1.js', { i: 'bar/foo1' });
      helper.command.addComponent('bar/foo2.js', { i: 'bar/foo2' });
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
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagComponent('utils/is-type');
      helper.command.exportComponent('utils/is-type');
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
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
      helper.fixtures.populateWorkspaceWithTwoComponents();
      helper.command.tagComponent('utils/is-type');
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
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
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
      helper.fs.createFile('utils', 'is-type.js', fixtures.isType);
      helper.fixtures.addComponentUtilsIsType();
      helper.command.tagComponent('utils/is-type');
      helper.fs.createFile('utils', 'is-string.js', fixtures.isString);
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
      helper.command.addComponent('bar', { m: 'foo.js', i: 'bar/foo' });
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
      helper.command.exportComponent('utils/is-string2', remote2, true, '--force');
    });
    // doesn't happen currently on @teambit/legacy, it'll be part of bit-dev.
    it.skip('should have is-type@0.0.2 on that remote', () => {
      const isType = helper.command.catComponent(`${helper.scopes.remote}/utils/is-type@0.0.2`, remote2Path);
      expect(isType).to.have.property('files');
    });
    // this fails when lane features is enabled because it has "parents" and this "parents"
    // causes dependencies to be fetched completely.
    // it also start failing during the PR #3656 implementation. since it is fine to have the
    // is-type on the server with version 0.0.1, I'm just skipping the test.
    it.skip('should not have is-type@0.0.1 on that remote', () => {
      let isType;
      try {
        isType = helper.command.catComponent(`${helper.scopes.remote}/utils/is-type@0.0.1`, remote2Path);
      } catch (err) {
        isType = err.toString();
      }
      expect(isType).to.have.string('component');
      expect(isType).to.have.string('was not found');
    });
    describe('export a component is-string1 with a dependency is-type of version 0.0.1', () => {
      before(() => {
        helper.command.importComponent('utils/is-string1');
        output = helper.command.exportComponent('utils/is-string1', remote2, true, '--force');
      });
      it('should not throw an error saying it does not have the version 0.0.1 of the dependency', () => {
        expect(output).to.not.have.string('failed loading version 0.0.1');
      });
      it('should show a successful message', () => {
        expect(output).to.have.string('exported 1 components to scope');
      });
      // doesn't happen currently on @teambit/legacy, it'll be part of bit-dev.
      it.skip('should fetch is-type@0.0.1 from remote1', () => {
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
          expect(output).to.have.string('unable to resolve group id of "nonExistGroup"');
        }
      });
    });
    describe('when the group exists and the current user has permission to that group', function () {
      if (isWin || process.env.npm_config_with_ssh) {
        // @ts-ignore
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
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
          helper.bitJson.addDefaultScope();
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
      describe('export with no remote and no flags when workspace config has defaultScope overridden for this component', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.bitJson.addDefaultScope('my-general-remote');
          helper.bitJson.addOverrides({ foo2: { defaultScope: helper.scopes.remote } });
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
    describe('when a component has flattened dependency change', () => {
      let output;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateWorkspaceWithThreeComponents();
        helper.bitJson.addDefaultScope();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.fs.outputFile('qux.js');
        helper.command.addComponent('qux.js');
        helper.fs.outputFile('utils/is-string.js', 'require("../qux");');
        helper.command.tagAllComponents();
        output = helper.command.export();
      });
      it('should send the component with the flattened dependency changes to the remote', () => {
        expect(output).to.have.string('exported the following 3 component(s)');
      });
    });
    describe('some components were exported to one scope and other to another scope', () => {
      let localScopeBefore;
      let remoteScopeBefore;
      let anotherRemoteScopeBefore;
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
        anotherRemoteScopeBefore = helper.scopeHelper.cloneScope(anotherRemotePath);
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
      // fixes https://github.com/teambit/bit/issues/2308
      // here, the component foo1 has a new dependency "bar", this dependency has been exported
      // already, so we expect "bit export" to not attempt to export it.
      describe('export with no ids, no remote and no flags when a dependency is from another collection', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
          const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
          helper.scopeHelper.addRemoteScope(scopePath);
          helper.scopeHelper.addRemoteScope(scopePath, helper.scopes.remotePath);
          helper.fs.outputFile('bar.js', '');
          helper.command.addComponent('bar.js');
          helper.fs.outputFile('foo1.js', 'require("./bar");');
          helper.command.tagAllComponents();
          helper.command.exportComponent('bar', scopeName);
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
        it('should not export the dependency that was not intended to be exported', () => {
          expect(output).to.not.have.string('bar');
        });
      });
      describe('export with ids, no remote and the flag --last-scope', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
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
      describe('non-circular dependency between the scopes', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
          helper.fs.outputFile('foo1.js', "require('./foo2');");
          helper.command.tagScope('3.0.0');
          helper.scopeHelper.addRemoteScope(anotherRemotePath, helper.scopes.remotePath);
          output = helper.command.export();
        });
        // before, it was throwing an error about component-not-found, that's because it tried
        // to export the dependency and the dependent at the same time. If the dependent is
        // exported first, in the remote of the dependent it fails because it's not able to find
        // the dependency as it was not exported yet.
        it('should be able to export them after toposort them', () => {
          expect(output).to.have.string('exported the following 2 component');
        });
      });
      // this doesn't work locally. on bit.dev there is a whole mechanism to handle export to
      // multiple scopes (even when they have circular dependencies).
      describe.skip('circular dependencies between the scopes', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
          helper.fs.outputFile('foo1.js', "require('./foo2');");
          helper.fs.outputFile('foo2.js', "require('./foo1');");
          helper.command.tagScope('3.0.0');
          helper.scopeHelper.addRemoteScope(anotherRemotePath, helper.scopes.remotePath);
          output = helper.general.runWithTryCatch('bit export');
        });
        it('should export them successfully', () => {
          expect(output).to.have.string('exported the following 2 component');
        });
      });
      describe('circular dependencies between the scopes in different versions', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
          helper.fs.outputFile('foo1.js', "require('./foo2');");

          helper.command.tagScope('3.0.0');
          helper.fs.outputFile('foo1.js', '');
          helper.fs.outputFile('foo2.js', "require('./foo1');");
          helper.command.tagScope('4.0.0');

          helper.scopeHelper.addRemoteScope(anotherRemotePath, helper.scopes.remotePath);
          helper.scopeHelper.addRemoteScope(helper.scopes.remotePath, anotherRemotePath);
          output = helper.general.runWithTryCatch('bit export');
        });
        it('should export them successfully', () => {
          expect(output).to.have.string('exported the following 2 component');
        });
      });
      // @todo: change the tagLegacy to tag once librarian is the package-manager for capsule to support cyclic
      describe('circular dependencies within the same scope and a non-circular dependency between the scopes', () => {
        let output;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
          helper.fs.outputFile('foo3.js', '');
          helper.command.addComponent('foo3.js');
          helper.command.tagAllComponents();
          helper.command.runCmd(`bit export ${anotherRemote} foo3`);
          helper.fs.outputFile('foo2.js', "require('./foo3');");
          helper.fs.outputFile('foo3.js', "require('./foo2');");
          helper.command.tagScope('3.0.0');
          helper.scopeHelper.addRemoteScope(anotherRemotePath, helper.scopes.remotePath);
          output = helper.command.export();
        });
        it('should export successfully', () => {
          expect(output).to.have.string('exported the following 3 component');
        });
      });
      describe('having another staged component without scope-name', () => {
        let output;
        let beforeExportScope;
        before(() => {
          helper.scopeHelper.getClonedLocalScope(localScopeBefore);
          helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
          helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
          helper.fs.outputFile('foo3.js');
          helper.command.addComponent('foo3.js');
          helper.command.tagAllComponents();
          beforeExportScope = helper.scopeHelper.cloneLocalScope();
        });
        describe('without defaultScope', () => {
          before(() => {
            output = helper.command.export();
          });
          it('should not throw an error "toGroupByScopeName() expect ids to have a scope name"', () => {
            expect(output).to.have.string('exported the following 2 component(s)');
          });
          it('should indicate that the component without scope-name was not exported', () => {
            expect(output).to.have.string('the following component(s) were not exported: foo3');
          });
        });
        describe('with defaultScope', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(beforeExportScope);
            helper.scopeHelper.getClonedRemoteScope(remoteScopeBefore);
            helper.scopeHelper.getClonedScope(anotherRemoteScopeBefore, anotherRemotePath);
            helper.bitJson.addDefaultScope();
            output = helper.command.export();
          });
          it('should export them all successfully', () => {
            expect(output).to.have.string('exported the following 3 component');
          });
          it('should export the non-scope into the defaultScope', () => {
            expect(output).to.have.string(`${helper.scopes.remote}/foo3`);
          });
        });
      });
    });
    describe('export to a different scope', () => {
      let forkScope;
      let forkScopePath;
      let localScope;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.fixtures.populateWorkspaceWithThreeComponents();
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
          forkScopeIds = forkScopeList.map((c) => c.id);
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
          expect(show).to.have.property('scopesList').with.lengthOf(2);
          expect(show.scopesList[0].name).to.equal(helper.scopes.remote);
          expect(show.scopesList[1].name).to.equal(forkScope);
        });
        describe('when an older version has dependencies that are not exist in the new version', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScope);
            helper.scopeHelper.reInitRemoteScope(forkScopePath);
            helper.fs.createFile('utils', 'is-string.js', ''); // remove the is-type dependency
            helper.command.tagAllComponents();
            helper.command.export('--all-versions');

            helper.command.export(`${forkScope} utils/is-string --include-dependencies`);
            const forkScopeList = helper.command.listScopeParsed(forkScope);
            forkScopeIds = forkScopeList.map((c) => c.id);
          });
          it('should fork the component', () => {
            expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-string`);
          });
          it('should fork the dependencies of the older version', () => {
            expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-type`);
          });
        });
        // in this case, is-string@0.0.1 has a dependency is-type@0.0.1.
        // the last version, 0.0.2, of is-string, doesn't have the dependency.
        // also, is-type has an additional version, 0.0.2, which is not required by any version of
        // is-string, which caused an error ENOENT of the is-type@0.0.2 object.
        describe('when an older version has dependencies that are not exist in the new version and those dependencies have more versions', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScope);
            helper.scopeHelper.reInitRemoteScope();
            helper.scopeHelper.reInitRemoteScope(forkScopePath);
            helper.fs.createFile('utils', 'is-string.js', ''); // remove the is-type dependency
            helper.fs.createFile('utils', 'is-type.js', ''); // add another version for is-type
            helper.command.tagAllComponents();
            helper.command.export('--all-versions');

            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.scopeHelper.addRemoteScope(forkScopePath);
            helper.command.importComponent('utils/is-string');

            helper.command.export(`${forkScope} utils/is-string --include-dependencies`);
            const forkScopeList = helper.command.listScopeParsed(forkScope);
            forkScopeIds = forkScopeList.map((c) => c.id);
          });
          it('should fork the component', () => {
            expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-string`);
          });
          it('should fork the dependencies of the older version', () => {
            expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-type`);
          });
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
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          const ids = list.map((i) => i.id);
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
          expect(isType).to.have.property('remotes').that.have.lengthOf(2);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(isType.remotes[0].name).to.equal(helper.scopes.remote);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          const ids = list.map((i) => i.id);
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
          expect(isType).to.have.property('remotes').that.have.lengthOf(2);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(isType.remotes[0].name).to.equal(helper.scopes.remote);
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
          it('should prompt for a confirmation before forking', () => {
            expect(output).to.have.string(
              `bit is about to fork the following components and export them to ${forkScope}.`
            );
          });
          it('should not export anything', () => {
            const remoteScope = helper.command.listScopeParsed(forkScope);
            expect(remoteScope).to.have.lengthOf(0);
          });
        });
        describe('with --force', () => {
          before(() => {
            helper.command.export(`${forkScope}`);
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
            helper.command.export(`${forkScope}`);
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
            helper.command.export(`${forkScope} --all`);
          });
          it('should export all even non-staged components', () => {
            const remoteScope = helper.command.listScopeParsed(forkScope);
            expect(remoteScope).to.have.lengthOf(4);
          });
        });
      });
      describe('with --rewire flag', () => {
        describe('without --set-current-scope', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScope);
            helper.scopeHelper.reInitRemoteScope(forkScopePath);
            helper.fixtures.createComponentUtilsIsString(fixtures.isStringModulePath(helper.scopes.remote));
            helper.fixtures.createComponentBarFoo(fixtures.barFooModulePath(helper.scopes.remote));
            helper.env.importDummyCompiler();
            helper.command.tagScope('1.0.0');
            helper.command.export(`${forkScope} --include-dependencies --rewire`);
          });
          it('should not change the files locally on the workspace', () => {
            const barFoo = helper.fs.readFile('bar/foo.js');
            expect(barFoo).to.equal(fixtures.barFooModulePath(helper.scopes.remote));
          });
          it('should not change the objects locally', () => {
            const barFoo = helper.command.catComponent(`${helper.scopes.remote}/bar/foo@latest`);
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const fileHash = barFoo.files[0].file;
            const fileContent = helper.command.catObject(fileHash);
            expect(fileContent).to.have.string(helper.scopes.remote);
            expect(fileContent).to.not.have.string(forkScope);
          });
          describe('importing the component from the fork scope to a new workspace', () => {
            before(() => {
              helper.scopeHelper.reInitLocalScope();
              helper.scopeHelper.addRemoteScope(forkScopePath);
              helper.command.runCmd(`bit import ${forkScope}/bar/foo`);
            });
            it('should write the source code with the changed source of the forked scope', () => {
              const barFoo = helper.fs.readFile('components/bar/foo/foo.js');
              expect(barFoo).to.have.string(forkScope);
              expect(barFoo).to.not.have.string(helper.scopes.remote);
            });
          });
        });
        describe('with --set-current-scope', () => {
          let localBeforeFork;
          before(() => {
            helper.scopeHelper.getClonedLocalScope(localScope);
            helper.scopeHelper.reInitRemoteScope(forkScopePath);
            helper.fixtures.createComponentUtilsIsString(fixtures.isStringModulePath(helper.scopes.remote));
            helper.fixtures.createComponentBarFoo(fixtures.barFooModulePath(helper.scopes.remote));
            helper.env.importDummyCompiler();
            helper.command.tagScope('1.0.0');
            localBeforeFork = helper.scopeHelper.cloneLocalScope();
            helper.command.export(`${forkScope} --include-dependencies --set-current-scope --rewire`);
          });
          it('should change the files locally on the workspace', () => {
            const barFoo = helper.fs.readFile('bar/foo.js');
            expect(barFoo).to.equal(fixtures.barFooModulePath(forkScope));
          });
          // turns out we don't write dists file for author (because author might has its own way of creating dists)
          it.skip('should change the dist files locally on the workspace', () => {
            const barFoo = helper.fs.readFile('dist/bar/foo.js');
            expect(barFoo).to.equal(fixtures.barFooModulePath(forkScope));
          });
          it('should change the files objects locally', () => {
            const barFoo = helper.command.catComponent(`${forkScope}/bar/foo@latest`);
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const fileHash = barFoo.files[0].file;
            const fileContent = helper.command.catObject(fileHash);
            expect(fileContent).to.not.have.string(helper.scopes.remote);
            expect(fileContent).to.have.string(forkScope);
          });
          it('should change the dists objects locally', () => {
            const barFoo = helper.command.catComponent(`${forkScope}/bar/foo@latest`);
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            const fileHash = barFoo.dists[0].file;
            const fileContent = helper.command.catObject(fileHash);
            expect(fileContent).to.not.have.string(helper.scopes.remote);
            expect(fileContent).to.have.string(forkScope);
          });
          it('should be able to require the components and the dependencies', () => {
            helper.command.build(); // to rewrite the dists. see above 'should change the dist files locally on the workspace'
            const appJsFixture = `const barFoo = require('@bit/${forkScope}.bar.foo'); console.log(barFoo());`;
            helper.fs.outputFile('app.js', appJsFixture);
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
          describe('without --rewire flag', () => {
            before(() => {
              helper.scopeHelper.getClonedLocalScope(localBeforeFork);
              helper.scopeHelper.reInitRemoteScope(forkScopePath);
              helper.command.export(`${forkScope} --set-current-scope`);
            });
            it('should not change the dists objects locally because --rewire was not used', () => {
              const barFoo = helper.command.catComponent(`${forkScope}/bar/foo@latest`);
              const fileHash = barFoo.dists[0].file;
              const fileContent = helper.command.catObject(fileHash);
              expect(fileContent).to.have.string(helper.scopes.remote);
              expect(fileContent).to.not.have.string(forkScope);
            });
          });
          describe('as imported', () => {
            let output;
            before(() => {
              helper.scopeHelper.getClonedLocalScope(localBeforeFork);
              helper.command.exportAllComponents();

              helper.scopeHelper.reInitLocalScope();
              helper.scopeHelper.addRemoteScope();
              helper.command.importComponent('bar/foo');

              helper.scopeHelper.reInitRemoteScope(forkScopePath);
              helper.scopeHelper.addRemoteScope(forkScopePath);
              output = helper.command.export(`${forkScope} --include-dependencies --set-current-scope --rewire --all`);
            });
            it('should change the files locally on the workspace', () => {
              const barFoo = helper.fs.readFile('components/bar/foo/foo.js');
              expect(barFoo).to.equal(fixtures.barFooModulePath(forkScope));
            });
            it('should change the dist files locally on the workspace', () => {
              const barFoo = helper.fs.readFile('components/bar/foo/dist/foo.js');
              expect(barFoo).to.equal(fixtures.barFooModulePath(forkScope));
            });
            it('should change the files objects locally', () => {
              const barFoo = helper.command.catComponent(`${forkScope}/bar/foo@latest`);
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              const fileHash = barFoo.files[0].file;
              const fileContent = helper.command.catObject(fileHash);
              expect(fileContent).to.not.have.string(helper.scopes.remote);
              expect(fileContent).to.have.string(forkScope);
            });
            it('should change the dists objects locally', () => {
              const barFoo = helper.command.catComponent(`${forkScope}/bar/foo@latest`);
              // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
              const fileHash = barFoo.dists[0].file;
              const fileContent = helper.command.catObject(fileHash);
              expect(fileContent).to.not.have.string(helper.scopes.remote);
              expect(fileContent).to.have.string(forkScope);
            });
            it('should not show a warning about untracked files', () => {
              expect(output).not.to.have.string(
                'bit did not update the workspace as the component files are not tracked'
              );
            });
            it('should remove the old components from the package.json', () => {
              const packageJson = helper.packageJson.read();
              expect(packageJson.dependencies).to.not.have.property(`@bit/${helper.scopes.remote}.bar.foo`);
              expect(packageJson.dependencies).to.have.property(`@bit/${forkScope}.bar.foo`);
            });
            it('should remove the old components from node_modules', () => {
              const oldComp = `node_modules/@bit/${helper.scopes.remote}.bar.foo`;
              expect(path.join(helper.scopes.localPath, oldComp)).not.to.be.a.path();
            });
            it('should be able to require the components and the dependencies', () => {
              const appJsFixture = `const barFoo = require('@bit/${forkScope}.bar.foo'); console.log(barFoo());`;
              helper.fs.outputFile('app.js', appJsFixture);
              const result = helper.command.runCmd('node app.js');
              expect(result.trim()).to.equal('got is-type and got is-string and got foo');
            });
          });
        });
      });
    });
  });
  describe('export with a remote that is not the same as defaultScope', () => {
    let anotherRemote;
    let anotherRemotePath;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithThreeComponents();
      helper.bitJson.addDefaultScope();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      anotherRemote = scopeName;
      anotherRemotePath = scopePath;
      helper.scopeHelper.addRemoteScope(anotherRemotePath);
      helper.command.tagAllComponents();
      helper.command.runCmd(`bit export ${anotherRemote} utils/is-type`);
    });
    it('should export to the specified remote', () => {
      const list = helper.command.listScopeParsed(anotherRemote);
      expect(list).to.have.lengthOf(1);
    });
  });
  describe('export after re-creating the remote', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithUtilsIsType();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitRemoteScope();
    });
    describe('export without any flag', () => {
      it('should show a message that nothing to export', () => {
        const output = helper.command.exportAllComponents();
        expect(output).to.have.string('nothing to export');
      });
    });
    describe('export with --all flag', () => {
      before(() => {
        helper.scopeHelper.reInitRemoteScope();
        helper.command.export(`${helper.scopes.remote} ${helper.scopes.remote}/* --all`);
      });
      it('should export them successfully', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
    });
    describe('export with --all flag', () => {
      before(() => {
        helper.scopeHelper.reInitRemoteScope();
        helper.command.export(`${helper.scopes.remote} ${helper.scopes.remote}/* --all-versions`);
      });
      it('should export them successfully', () => {
        const list = helper.command.listRemoteScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
    });
  });
  describe('re-export using the component name without the scope name', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.command.tagComponent('bar/foo -f');
      helper.command.exportAllComponents();
      helper.command.tagComponent('bar/foo -f');
      output = helper.command.exportComponent('bar/foo');
    });
    // this was a bug where on the third export, it parses the id "bar/foo" as: { scope: bar, name: foo }
    it('should not show the "fork" prompt', () => {
      expect(output).to.have.string('exported 1 components');
    });
  });
});
