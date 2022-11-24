import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('binary files', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('exporting a PNG file in addition to a .js file', () => {
    let pngSize;
    let destPngFile;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.createComponentBarFoo();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const stats = fs.statSync(destPngFile);
      pngSize = stats.size;
      helper.command.addComponent('bar', { m: 'foo.js', i: 'bar/foo' });
      helper.command.tagAllWithoutBuild();
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
  // legacy test, to check the writing of links in node_modules for author.
  // new code doesn't have it. only one symlink and that's it.
  describe('exporting a PNG file as the only file', () => {
    let pngSize;
    let destPngFile;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const stats = fs.statSync(destPngFile);
      pngSize = stats.size;
      helper.command.addComponent('bar', { m: 'png_fixture.png', i: 'bar/foo' });
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope(false);
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not install a package "undefined" ', () => {
      expect(path.join(helper.scopes.localPath, 'node_modules/undefined')).to.not.be.a.path;
    });
    describe('after importing the file', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo', '--path components/bar/foo');
      });
      it('the size of the binary file should not be changed', () => {
        const currentStats = fs.statSync(path.join(helper.scopes.localPath, 'components/bar/foo/png_fixture.png'));
        const currentSize = currentStats.size;
        expect(currentSize).to.equal(pngSize);
      });
    });
  });
});
