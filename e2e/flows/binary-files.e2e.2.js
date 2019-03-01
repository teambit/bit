import path from 'path';
import fs from 'fs-extra';
import glob from 'glob';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import { statusWorkspaceIsCleanMsg } from '../../src/cli/commands/public-cmds/status-cmd';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('binary files', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('exporting a PNG file in addition to a .js file', () => {
    let pngSize;
    let destPngFile;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.localScopePath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const stats = fs.statSync(destPngFile);
      pngSize = stats.size;
      helper.runCmd('bit add bar -m foo.js -i bar/foo');
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    it('should export it with no errors', () => {
      const output = helper.listRemoteScope();
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    describe('after importing the file', () => {
      before(() => {
        helper.importComponent('bar/foo');
      });
      it('the size of the binary file should not be changed', () => {
        const currentStats = fs.statSync(destPngFile);
        const currentSize = currentStats.size;
        expect(currentSize).to.equal(pngSize);
      });
    });
  });
  describe('exporting a PNG file as the only file', () => {
    let pngSize;
    let destPngFile;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.localScopePath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const stats = fs.statSync(destPngFile);
      pngSize = stats.size;
      helper.runCmd('bit add bar -m png_fixture.png -i bar/foo');
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    it('should export it with no errors', () => {
      const output = helper.listRemoteScope();
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not create any other file in node_modules/@bit other than the binary file itself', () => {
      const files = glob.sync(path.normalize('**/*'), {
        cwd: path.join(helper.localScopePath, 'node_modules/@bit'),
        nodir: true
      });
      expect(files).to.be.lengthOf(1);
      expect(files[0]).to.have.string('png_fixture.png');
    });
    it('should create the file in node_modules/@bit as a symlink', () => {
      const symlinkPath = path.join(
        helper.localScopePath,
        `node_modules/@bit/${helper.remoteScope}.bar.foo/bar/png_fixture.png`
      );
      const symlinkValue = fs.readlinkSync(symlinkPath);
      expect(symlinkValue).to.have.string(path.join('bar', 'png_fixture.png'));
    });
    it('should not install a package "undefined" ', () => {
      expect(path.join(helper.localScopePath, 'node_modules/undefined')).to.not.be.a.path;
    });
    describe('after importing the file', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
      });
      it('the size of the binary file should not be changed', () => {
        const currentStats = fs.statSync(path.join(helper.localScopePath, 'components/bar/foo/png_fixture.png'));
        const currentSize = currentStats.size;
        expect(currentSize).to.equal(pngSize);
      });
      it('should generate a package.json with "main" property pointing to the binary file', () => {
        const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
        expect(packageJson.main).to.equal('png_fixture.png');
      });
    });
  });
  describe('importing a PNG file as the only file and have it as a dependency of another component', () => {
    let destPngFile;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.localScopePath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.runCmd('bit add bar -m png_fixture.png -i bar/png');
      const fixture = 'require("./png_fixture.png")';
      helper.createFile('bar', 'foo.js', fixture);
      helper.addComponent('bar/foo.js', { i: 'bar/foo' });
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    it('should create a symlink or copy of the dependency file inside the component dir', () => {
      const expectedDest = path.join(helper.localScopePath, 'components/bar/foo/png_fixture.png');
      expect(expectedDest).to.be.a.file();

      const symlinkValue = fs.readlinkSync(expectedDest);
      expect(symlinkValue).to.have.string(
        path.join('components/.dependencies/bar/png', helper.remoteScope, '/0.0.1/bar/png_fixture.png')
      );
    });
    it('bit-status should not show the component as modified', () => {
      const status = helper.status();
      expect(status).to.have.string(statusWorkspaceIsCleanMsg);
    });
  });
  describe('import a PNG file as a dependency with custom-resolve-modules', () => {
    let destPngFile;
    const npmCiRegistry = new NpmCiRegistry(helper);
    before(() => {
      helper.setNewLocalAndRemoteScopes();

      npmCiRegistry.setCiScopeInBitJson();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.writeBitJson(bitJson);

      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.localScopePath, 'src/bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.runCmd('bit add src/bar -m png_fixture.png -i bar/png');
      const fixture = 'require("bar/png_fixture.png")';
      helper.createFile('src/foo', 'foo.js', fixture);
      helper.addComponent('src/foo/foo.js', { i: 'bar/foo' });
      helper.tagAllComponents();
      helper.exportAllComponents();

      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    it('should create a symlink or copy of the dependency file inside the component dir', () => {
      const expectedDest = path.join(helper.localScopePath, 'components/bar/foo/node_modules/bar/png_fixture.png');
      expect(expectedDest).to.be.a.file();

      const symlinkValue = fs.readlinkSync(expectedDest);
      expect(symlinkValue).to.have.string(
        path.join('components/.dependencies/bar/png', helper.remoteScope, '/0.0.1/src/bar/png_fixture.png')
      );
    });
    it('bit-status should not show the component as modified', () => {
      const status = helper.status();
      expect(status).to.have.string(statusWorkspaceIsCleanMsg);
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      let barFooPath;
      let barPngPath;
      before(async () => {
        await npmCiRegistry.init();
        helper.importNpmPackExtension();
        helper.removeRemoteScope();
        npmCiRegistry.publishComponent('bar/png');
        npmCiRegistry.publishComponent('bar/foo');

        helper.reInitLocalScope();
        helper.runCmd('npm init -y');
        helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);

        barFooPath = path.join('node_modules/@ci', `${helper.remoteScope}.bar.foo`);
        barPngPath = path.join('node_modules/@ci', `${helper.remoteScope}.bar.png`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should generate .bit.postinstall.js file', () => {
        expect(path.join(helper.localScopePath, barFooPath, '.bit.postinstall.js')).to.be.a.file();
      });
      it('should create a symlink on node_modules pointing to the unsupported file', () => {
        const expectedDest = path.join(helper.localScopePath, barFooPath, 'node_modules/bar/png_fixture.png');
        expect(expectedDest).to.be.a.file();

        const symlinkValue = fs.readlinkSync(expectedDest);
        expect(symlinkValue).to.have.string(path.join(barPngPath, 'png_fixture.png'));
      });
    });
  });
});
