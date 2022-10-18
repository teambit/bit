import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit export command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('with no components to export', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
    });
    it('should print nothing to export', () => {
      const output = helper.command.export();
      expect(output).to.include('nothing to export');
    });
  });
  describe('with multiple versions', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportIds('bar/foo');
      helper.command.tagComponent('bar/foo -f');
      helper.command.exportIds('bar/foo');
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
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportIds('bar/foo'); // v1

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo', '--path components/bar/foo');

      helper.fs.createFile(path.join('components', 'bar', 'foo'), 'foo.js', 'console.log("got foo v2")');
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportIds('bar/foo'); // v2

      helper.fs.createFile(path.join('components', 'bar', 'foo'), 'foo.js', 'console.log("got foo v3")');
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportIds('bar/foo'); // v3
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScopeIds();
      expect(output.includes(`${helper.scopes.remote}/bar/foo@0.0.3`)).to.be.true;
    });
  });

  describe('with a PNG file', () => {
    let pngSize;
    let destPngFile;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const stats = fs.statSync(destPngFile);
      pngSize = stats.size;
      helper.command.addComponent('bar', { m: 'foo.js', i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.export();
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope(false);
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
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.fixtures.tagComponentBarFoo();
      helper.command.exportIds('bar/foo');
      output = helper.command.exportIds('bar/foo', undefined, false);
    });
    it('should not export the component', () => {
      expect(output).to.have.string('nothing to export');
    });
  });
  describe('export a component when the checked out version is not the latest', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo('// v2');
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagIncludeUnmodified('2.0.0');
      helper.command.export();
      helper.fixtures.createComponentBarFoo('// v1');
      helper.command.tagIncludeUnmodified('1.0.0');
      helper.command.export();
    });
    it('.bitmap should keep the current version and do not update to the latest version', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap['bar/foo'].version).to.equal('1.0.0');
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
      helper.fixtures.addComponentBarFooAsDir();
      helper.bitJsonc.setupDefault();
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
        const output = helper.general.runWithTryCatch(`bit export`);
        if (isWin) {
          expect(output).to.have.string('exported the following 1 component(s)');
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
          const output = helper.command.export();
          expect(output).to.have.string('exported the following 1 component');
        });
      }
    });
  });
  describe('export after re-creating the remote', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllComponents();
      helper.command.export();
      helper.scopeHelper.reInitRemoteScope();
    });
    describe('export without any flag', () => {
      it('should show a message that nothing to export', () => {
        const output = helper.command.export();
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
      helper.bitJsonc.setupDefault();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFooAsDir();
      helper.command.tagAllComponents();
      helper.command.export();
      helper.command.tagComponent('bar/foo -f');
      helper.command.export();
      helper.command.tagComponent('bar/foo -f');
      output = helper.command.exportIds('bar/foo');
    });
    // this was a bug where on the third export, it parses the id "bar/foo" as: { scope: bar, name: foo }
    it('should not show the "fork" prompt', () => {
      expect(output).to.have.string('exported the following 1 component(s)');
    });
  });
});
