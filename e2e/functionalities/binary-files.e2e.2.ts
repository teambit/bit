import chai, { expect } from 'chai';
import fs from 'fs-extra';
import glob from 'glob';
import * as path from 'path';

import { AUTO_GENERATED_STAMP } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('binary files', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('exporting a PNG file in addition to a .js file', () => {
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
  // legacy test, to check the writing of links in node_modules for author.
  // new code doesn't have it. only one symlink and that's it.
  describe('exporting a PNG file as the only file', () => {
    let pngSize;
    let destPngFile;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const stats = fs.statSync(destPngFile);
      pngSize = stats.size;
      helper.command.addComponent('bar', { m: 'png_fixture.png', i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should export it with no errors', () => {
      const output = helper.command.listRemoteScope();
      expect(output.includes('found 1 components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not create any other file in node_modules/@bit other than the binary file itself and package.json', () => {
      const files = glob.sync(path.normalize('**/*'), {
        cwd: path.join(helper.scopes.localPath, 'node_modules/@bit'),
        nodir: true,
      });
      expect(files).to.be.lengthOf(2);
      expect(files.some((f) => f.includes('png_fixture.png'))).to.be.true;
      expect(files.some((f) => f.includes('package.json'))).to.be.true;
    });
    it('should create the file in node_modules/@bit as a symlink', () => {
      const symlinkPath = path.join(
        helper.scopes.localPath,
        `node_modules/@bit/${helper.scopes.remote}.bar.foo/bar/png_fixture.png`
      );
      const symlinkValue = fs.readlinkSync(symlinkPath);
      expect(symlinkValue).to.have.string(path.join('bar', 'png_fixture.png'));
    });
    it('should not install a package "undefined" ', () => {
      expect(path.join(helper.scopes.localPath, 'node_modules/undefined')).to.not.be.a.path;
    });
    describe('after importing the file', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('the size of the binary file should not be changed', () => {
        const currentStats = fs.statSync(path.join(helper.scopes.localPath, 'components/bar/foo/png_fixture.png'));
        const currentSize = currentStats.size;
        expect(currentSize).to.equal(pngSize);
      });
      it('should generate a package.json with "main" property pointing to the binary file', () => {
        const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
        expect(packageJson.main).to.equal('png_fixture.png');
      });
    });
  });
  describe('importing a PNG file as the only file and have it as a dependency of another component', () => {
    let destPngFile;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.command.addComponent('bar', { m: 'png_fixture.png', i: 'bar/png' });
      const fixture = 'require("./png_fixture.png")';
      helper.fs.createFile('bar', 'foo.js', fixture);
      helper.command.addComponent('bar/foo.js', { i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('should create a symlink or copy of the dependency file inside the component dir', () => {
      const expectedDest = path.join(helper.scopes.localPath, 'components/bar/foo/png_fixture.png');
      expect(expectedDest).to.be.a.file();

      const symlinkValue = fs.readlinkSync(expectedDest);
      expect(symlinkValue).to.have.string(path.normalize('components/.dependencies/bar/png'));
      expect(symlinkValue).to.be.a.path();
    });
    it('bit-status should not show the component as modified', () => {
      helper.command.expectStatusToBeClean();
    });
  });
  describe('import a PNG file as a dependency with custom-resolve-modules', () => {
    let destPngFile;
    let npmCiRegistry;
    before(() => {
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();

      npmCiRegistry.setCiScopeInBitJson();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.bitJson.write(bitJson);

      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'src/bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.command.addComponent('src/bar', { m: 'png_fixture.png', i: 'bar/png' });
      const fixture = 'require("bar/png_fixture.png")';
      helper.fs.createFile('src/foo', 'foo.js', fixture);
      helper.command.addComponent('src/foo/foo.js', { i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('should create a symlink or copy of the dependency file inside the component dir', () => {
      const expectedDest = path.join(helper.scopes.localPath, 'components/bar/foo/node_modules/bar/png_fixture.png');
      expect(expectedDest).to.be.a.file();

      const symlinkValue = fs.readlinkSync(expectedDest);
      expect(symlinkValue).to.have.string(path.normalize('components/.dependencies/bar/png'));
      expect(symlinkValue).to.be.a.path();
    });
    it('bit-status should not show the component as modified', () => {
      helper.command.expectStatusToBeClean();
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      let barFooPath;
      let barPngPath;
      before(async () => {
        await npmCiRegistry.init();
        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.publishComponent('bar/png');
        npmCiRegistry.publishComponent('bar/foo');

        helper.scopeHelper.reInitLocalScope();
        helper.command.runCmd('npm init -y');
        helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);

        barFooPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.foo`);
        barPngPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.png`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      it('should generate .bit.postinstall.js file', () => {
        expect(path.join(helper.scopes.localPath, barFooPath, '.bit.postinstall.js')).to.be.a.file();
      });
      it('should create a symlink on node_modules pointing to the unsupported file', () => {
        const expectedDest = path.join(helper.scopes.localPath, barFooPath, 'node_modules/bar/png_fixture.png');
        expect(expectedDest).to.be.a.file();

        const symlinkValue = fs.readlinkSync(expectedDest);
        expect(symlinkValue).to.have.string(path.join(barPngPath, 'png_fixture.png'));
      });
    });
  });
  describe('import a PNG file as a dependency', () => {
    let destPngFile;
    let npmCiRegistry;
    before(() => {
      helper = new Helper();
      helper.command.setFeatures('legacy-workspace-config');
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry.setCiScopeInBitJson();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'src/bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.command.addComponent('src/bar', { m: 'png_fixture.png', i: 'bar/png' });
      const fixture = 'require("../bar/png_fixture.png")';
      helper.fs.createFile('src/foo', 'foo.js', fixture);
      helper.command.addComponent('src/foo/foo.js', { i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('should create a symlink or copy of the dependency file inside the component dir', () => {
      const expectedDest = path.join(helper.scopes.localPath, 'components/bar/foo/bar/png_fixture.png');
      expect(expectedDest).to.be.a.file();

      const symlinkValue = fs.readlinkSync(expectedDest);
      expect(symlinkValue).to.have.string(path.normalize('components/.dependencies/bar/png'));
      expect(symlinkValue).to.be.a.path();
    });
    it('bit-status should not show the component as modified', () => {
      helper.command.expectStatusToBeClean();
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      let barFooPath;
      let barPngPath;
      before(async () => {
        await npmCiRegistry.init();
        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.publishComponent('bar/png');
        npmCiRegistry.publishComponent('bar/foo');
        barFooPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.foo`);
        barPngPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.png`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('installing a component using NPM', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.command.runCmd('npm init -y');
          helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
        });
        it('should generate .bit.postinstall.js file', () => {
          expect(path.join(helper.scopes.localPath, barFooPath, '.bit.postinstall.js')).to.be.a.file();
        });
        it('should create a symlink pointing to the package of the unsupported file', () => {
          const expectedDest = path.join(helper.scopes.localPath, barFooPath, 'bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(path.join(barPngPath, 'png_fixture.png'));
        });
      });
      describe('installing a component using bit import', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          npmCiRegistry.setResolver();
          helper.command.importComponent('bar/foo');
        });
        it('should create a symlink pointing to the package of the unsupported file', () => {
          const barFooDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          const expectedDest = path.join(barFooDir, 'bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(
            path.join(barFooDir, 'node_modules/@ci', `${helper.scopes.remote}.bar.png`, 'png_fixture.png')
          );
        });
      });
    });
  });
  describe('import a PNG file as a dependency with dists', () => {
    let destPngFile;
    let npmCiRegistry;
    before(() => {
      helper = new Helper();
      helper.command.setFeatures('legacy-workspace-config');
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry.setCiScopeInBitJson();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'src/bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.command.addComponent('src/bar', { m: 'png_fixture.png', i: 'bar/png' });
      const fixture = 'require("../bar/png_fixture.png")';
      helper.fs.createFile('src/foo', 'foo.js', fixture);
      helper.command.addComponent('src/foo/foo.js', { i: 'bar/foo' });
      helper.env.importDummyCompiler();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('should create a symlink or copy of the dependency file inside the component dir', () => {
      const expectedDest = path.join(helper.scopes.localPath, 'components/bar/foo/bar/png_fixture.png');
      expect(expectedDest).to.be.a.file();

      const symlinkValue = fs.readlinkSync(expectedDest);
      expect(symlinkValue).to.have.string(path.normalize('components/.dependencies/bar/png'));
      expect(symlinkValue).to.be.a.path();
    });
    it('bit-status should not show the component as modified', () => {
      helper.command.expectStatusToBeClean();
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      let barFooPath;
      let barPngPath;
      before(async () => {
        await npmCiRegistry.init();
        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.publishComponent('bar/png');
        npmCiRegistry.publishComponent('bar/foo');

        barFooPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.foo`);
        barPngPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.png`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('installing a component using NPM', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.command.runCmd('npm init -y');
          helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
        });
        it('should generate .bit.postinstall.js file', () => {
          expect(path.join(helper.scopes.localPath, barFooPath, '.bit.postinstall.js')).to.be.a.file();
        });
        it('should create a symlink pointing to the package of the unsupported file', () => {
          const expectedDest = path.join(helper.scopes.localPath, barFooPath, 'bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(path.join(barPngPath, 'dist/png_fixture.png'));
        });
      });
      describe('installing a component using bit import', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          npmCiRegistry.setResolver();
          helper.command.importComponent('bar/foo');
        });
        it('should create a symlink pointing to the package of the unsupported file', () => {
          const barFooDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          const expectedDest = path.join(barFooDir, 'bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(
            path.join(barFooDir, 'node_modules/@ci', `${helper.scopes.remote}.bar.png`, 'dist/png_fixture.png')
          );
        });
        it('should create a symlink in dist dir pointing to the package of the unsupported file', () => {
          const barFooDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          const expectedDest = path.join(barFooDir, 'dist/bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(
            path.join(barFooDir, 'node_modules/@ci', `${helper.scopes.remote}.bar.png`, 'dist/png_fixture.png')
          );
        });
      });
    });
  });
  describe('import a PNG file as a dependency with dists and not as a main file', () => {
    let destPngFile;
    let npmCiRegistry;
    before(() => {
      helper = new Helper();
      helper.command.setFeatures('legacy-workspace-config');
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry.setCiScopeInBitJson();
      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      destPngFile = path.join(helper.scopes.localPath, 'src/bar', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      helper.fs.createFile('src/bar', 'index.js', "require('./png_fixture.png');");
      helper.command.addComponent('src/bar', { m: 'index.js', i: 'bar/png' });
      const fixture = 'require("../bar/png_fixture.png")';
      helper.fs.createFile('src/foo', 'foo.js', fixture);
      helper.command.addComponent('src/foo/foo.js', { i: 'bar/foo' });
      helper.env.importDummyCompiler();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();

      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo');
    });
    it('should create a symlink or copy of the dependency file inside the component dir', () => {
      const expectedDest = path.join(helper.scopes.localPath, 'components/bar/foo/bar/png_fixture.png');
      expect(expectedDest).to.be.a.file();

      const symlinkValue = fs.readlinkSync(expectedDest);
      expect(symlinkValue).to.have.string(path.normalize('components/.dependencies/bar/png'));
      expect(symlinkValue).to.be.a.path();
    });
    it('bit-status should not show the component as modified', () => {
      helper.command.expectStatusToBeClean();
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      let barFooPath;
      let barPngPath;
      before(async () => {
        await npmCiRegistry.init();
        helper.scopeHelper.removeRemoteScope();
        npmCiRegistry.publishComponent('bar/png');
        npmCiRegistry.publishComponent('bar/foo');

        barFooPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.foo`);
        barPngPath = path.join('node_modules/@ci', `${helper.scopes.remote}.bar.png`);
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      describe('installing a component using NPM', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.command.runCmd('npm init -y');
          helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
        });
        it('should generate .bit.postinstall.js file', () => {
          expect(path.join(helper.scopes.localPath, barFooPath, '.bit.postinstall.js')).to.be.a.file();
        });
        it('should create a symlink pointing to the package of the unsupported file', () => {
          const expectedDest = path.join(helper.scopes.localPath, barFooPath, 'bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(path.join(barPngPath, 'dist/png_fixture.png'));
        });
      });
      describe('installing a component using bit import', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          npmCiRegistry.setResolver();
          helper.command.importComponent('bar/foo');
        });
        it('should create a symlink pointing to the package of the unsupported file', () => {
          const barFooDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          const expectedDest = path.join(barFooDir, 'bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(
            path.join(barFooDir, 'node_modules/@ci', `${helper.scopes.remote}.bar.png`, 'dist/png_fixture.png')
          );
        });
        it('should create a symlink in dist dir pointing to the package of the unsupported file', () => {
          const barFooDir = path.join(helper.scopes.localPath, 'components/bar/foo');
          const expectedDest = path.join(barFooDir, 'dist/bar/png_fixture.png');
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.have.string(
            path.join(barFooDir, 'node_modules/@ci', `${helper.scopes.remote}.bar.png`, 'dist/png_fixture.png')
          );
        });
      });
    });
  });
  describe('export an md file with the same name as another js file with compiler (bug #1628)', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fs.createFile('bar', 'my-comp.md', 'some md5 content');
      helper.fs.createFile('bar', 'my-comp.js');
      helper.command.addComponent('bar', { m: 'my-comp.js', i: 'bar/foo' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.env.importDummyCompiler();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should not overwrite the md file with an auto-generated content', () => {
      const mdContent = helper.fs.readFile('bar/my-comp.md');
      expect(mdContent).to.not.have.string(AUTO_GENERATED_STAMP);
      expect(mdContent).to.have.string('some md5 content');
    });
  });
});
