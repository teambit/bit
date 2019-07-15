import fs from 'fs-extra';
import path from 'path';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('custom module resolutions', function () {
  this.timeout(0);
  let helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('using custom module directory', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.writeBitJson(bitJson);

      helper.createFile('src/utils', 'is-type.js', fixtures.isType);
      const isStringFixture =
        "const isType = require('utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      const barFooFixture =
        "const isString = require('utils/is-string'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      helper.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo' });
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.showComponentParsed('bar/foo');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].importSource).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
    });
    describe('isolation the component using the capsule', () => {
      let capsuleDir;
      before(() => {
        capsuleDir = helper.generateRandomTmpDirName();
        helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      });
      it('should not delete the dependencies file paths', () => {
        const packageJson = helper.readPackageJson(capsuleDir);
        expect(packageJson.dependencies)
          .to.have.property('@bit/utils.is-string')
          .that.equal(path.normalize('file:.dependencies/utils/is-string'));
        expect(packageJson.dependencies)
          .to.have.property('@bit/utils.is-type')
          .that.equal(path.normalize('file:.dependencies/utils/is-type'));
      });
    });
    describe('importing the component', () => {
      before(() => {
        helper.tagAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      it('should add the resolve aliases mapping into package.json for the pnp feature', () => {
        const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'components/bar/foo'));
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.have.property('resolveAliases');
        expect(packageJson.bit.resolveAliases).to.have.property('utils/is-string');
        expect(packageJson.bit.resolveAliases['utils/is-string']).to.equal(
          `@bit/${helper.remoteScope}.utils.is-string`
        );
      });
      describe('importing the component using isolated environment', () => {
        let isolatePath;
        before(() => {
          isolatePath = helper.isolateComponent('bar/foo', '-olw');
        });
        it('should be able to generate the links correctly and require the dependencies', () => {
          const appJsFixture = `const barFoo = require('./');
  console.log(barFoo());`;
          fs.outputFileSync(path.join(isolatePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js', isolatePath);
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
      describe('npm packing the component using an extension npm-pack', () => {
        let packDir;
        before(() => {
          helper.importNpmPackExtension();
          packDir = path.join(helper.localScopePath, 'pack');
          helper.runCmd(`bit npm-pack ${helper.remoteScope}/bar/foo -o -k -d ${packDir}`);
        });
        it('should create the specified directory', () => {
          expect(packDir).to.be.a.path();
        });
        it('should generate .bit.postinstall.js file', () => {
          expect(path.join(packDir, '.bit.postinstall.js')).to.be.a.file();
        });
        it('should add the postinstall script to the package.json file', () => {
          const packageJson = helper.readPackageJson(packDir);
          expect(packageJson).to.have.property('scripts');
          expect(packageJson.scripts).to.have.property('postinstall');
          expect(packageJson.scripts.postinstall).to.equal('node .bit.postinstall.js');
        });
        it('should add the resolve aliases mapping into package.json for the pnp feature', () => {
          const packageJson = helper.readPackageJson(packDir);
          expect(packageJson).to.have.property('bit');
          expect(packageJson.bit).to.have.property('resolveAliases');
          expect(packageJson.bit.resolveAliases).to.have.property('utils/is-string');
          expect(packageJson.bit.resolveAliases['utils/is-string']).to.equal(
            `@bit/${helper.remoteScope}.utils.is-string`
          );
        });
      });
    });
  });
  describe('using custom module directory when two files in the same component requires each other', () => {
    describe('with dependencies', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        const bitJson = helper.readBitJson();
        bitJson.resolveModules = { modulesDirectories: ['src'] };
        helper.writeBitJson(bitJson);

        helper.createFile('src/utils', 'is-type.js', fixtures.isType);
        const isStringFixture =
          "const isType = require('utils/is-type');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
        const barFooFixture =
          "const isString = require('utils/is-string');\n module.exports = function foo() { return isString() + ' and got foo'; };";
        helper.createFile('src/utils', 'is-string.js', isStringFixture);
        helper.createFile('src/bar', 'foo.js', barFooFixture);
        helper.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
        helper.addComponent('src/bar/foo.js src/utils/is-string.js', { i: 'bar/foo', m: 'src/bar/foo.js' });
      });
      it('bit status should not warn about missing packages', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('missing');
      });
      it('bit show should show the dependencies correctly', () => {
        const output = helper.showComponentParsed('bar/foo');
        expect(output.dependencies).to.have.lengthOf(1);
        const dependency = output.dependencies[0];
        expect(dependency.id).to.equal('utils/is-type');
        expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-type.js');
        expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-type.js');
        expect(dependency.relativePaths[0].importSource).to.equal('utils/is-type');
        expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
      });
      describe('importing the component', () => {
        before(() => {
          helper.tagAllComponents();
          // an intermediate step, make sure it saves the customResolvedPaths in the model
          const catComponent = helper.catComponent('bar/foo@latest');
          expect(catComponent).to.have.property('customResolvedPaths');
          expect(catComponent.customResolvedPaths[0].destinationPath).to.equal('src/utils/is-string.js');
          expect(catComponent.customResolvedPaths[0].importSource).to.equal('utils/is-string');
          helper.exportAllComponents();

          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
        });
        it('should generate the non-relative links correctly', () => {
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        it('should not show the component as modified', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.not.have.string('modified');
        });
      });
    });
    describe('without dependencies', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        const bitJson = helper.readBitJson();
        bitJson.resolveModules = { modulesDirectories: ['src'] };
        helper.writeBitJson(bitJson);

        helper.createFile('src/utils', 'is-type.js', fixtures.isType);
        const isStringFixture =
          "const isType = require('utils/is-type');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
        const barFooFixture =
          "const isString = require('utils/is-string');\n module.exports = function foo() { return isString() + ' and got foo'; };";
        helper.createFile('src/utils', 'is-string.js', isStringFixture);
        helper.createFile('src/bar', 'foo.js', barFooFixture);
        helper.addComponent('src', { i: 'bar/foo', m: 'src/bar/foo.js' });
        helper.tagAllComponents();
      });
      it('bit status should not warn about missing packages', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('missing');
      });
      it('should show the customResolvedPaths correctly', () => {
        const barFoo = helper.catComponent('bar/foo@latest');
        expect(barFoo).to.have.property('customResolvedPaths');
        expect(barFoo.customResolvedPaths).to.have.lengthOf(2);
        expect(barFoo.customResolvedPaths).to.deep.include({
          destinationPath: 'src/utils/is-string.js',
          importSource: 'utils/is-string'
        });
        expect(barFoo.customResolvedPaths).to.deep.include({
          destinationPath: 'src/utils/is-type.js',
          importSource: 'utils/is-type'
        });
      });
      describe('importing the component', () => {
        before(() => {
          helper.exportAllComponents();

          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
        });
        it('should generate the non-relative links correctly', () => {
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        it('should not show the component as modified', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.not.have.string('modified');
        });
        describe('npm packing the component using an extension npm-pack', () => {
          let packDir;
          before(() => {
            helper.importNpmPackExtension();
            packDir = path.join(helper.localScopePath, 'pack');
            helper.runCmd(`bit npm-pack ${helper.remoteScope}/bar/foo -o -k -d ${packDir}`);
          });
          it('should create the specified directory', () => {
            expect(packDir).to.be.a.path();
          });
          it('should generate .bit.postinstall.js file', () => {
            expect(path.join(packDir, '.bit.postinstall.js')).to.be.a.file();
          });
          it('should add the postinstall script to the package.json file', () => {
            const packageJson = helper.readPackageJson(packDir);
            expect(packageJson).to.have.property('scripts');
            expect(packageJson.scripts).to.have.property('postinstall');
            expect(packageJson.scripts.postinstall).to.equal('node .bit.postinstall.js');
          });
          it('npm install should create the custom-resolved dir inside node_modules', () => {
            helper.runCmd('npm i', packDir);
            expect(path.join(packDir, 'node_modules/utils/is-string')).to.be.a.file();
            expect(path.join(packDir, 'node_modules/utils/is-type')).to.be.a.file();
            expect(() => helper.runCmd(`node ${packDir}/bar/foo.js`)).to.not.throw();
          });
          it('should add the resolve aliases mapping into package.json for the pnp feature', () => {
            const packageJson = helper.readPackageJson(packDir);
            const packageName = helper.getRequireBitPath('bar', 'foo');
            expect(packageJson.bit.resolveAliases)
              .to.have.property('utils/is-string')
              .that.equal(`${packageName}/utils/is-string.js`);
            expect(packageJson.bit.resolveAliases)
              .to.have.property('utils/is-type')
              .that.equal(`${packageName}/utils/is-type.js`);
          });
        });
      });
    });
  });
  describe('using custom module directory when a component uses an internal file of another component', () => {
    const npmCiRegistry = new NpmCiRegistry(helper);
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.writeBitJson(bitJson);
      npmCiRegistry.setCiScopeInBitJson();
      helper.createFile('src/utils', 'is-type.js', '');
      helper.createFile('src/utils', 'is-type-internal.js', fixtures.isType);
      helper.addComponent('src/utils/is-type.js src/utils/is-type-internal.js', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.js'
      });

      const isStringFixture =
        "const isType = require('utils/is-type-internal');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('src/utils', 'is-string.js', '');
      helper.createFile('src/utils', 'is-string-internal.js', isStringFixture);
      helper.addComponent('src/utils/is-string.js src/utils/is-string-internal.js', {
        i: 'utils/is-string',
        m: 'src/utils/is-string.js'
      });

      const barFooFixture =
        "const isString = require('utils/is-string-internal');\n module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo', m: 'src/bar/foo.js' });
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.showComponentParsed('bar/foo');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string-internal.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string-internal.js');
      expect(dependency.relativePaths[0].importSource).to.equal('utils/is-string-internal');
      expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
    });
    describe('importing the component', () => {
      before(() => {
        helper.tagAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
        before(async () => {
          await npmCiRegistry.init();
          helper.importNpmPackExtension();
          helper.removeRemoteScope();
          npmCiRegistry.publishComponent('utils/is-type');
          npmCiRegistry.publishComponent('utils/is-string');
          npmCiRegistry.publishComponent('bar/foo');

          helper.reInitLocalScope();
          helper.runCmd('npm init -y');
          helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
    });
  });
  describe('using custom module directory when a component uses an internal binary file of the same component', () => {
    let npmCiRegistry;
    before(() => {
      helper = new Helper();
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.writeBitJson(bitJson);
      npmCiRegistry.setCiScopeInBitJson();

      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      const destPngFile = path.join(helper.localScopePath, 'src/assets', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const barFooFixture = "require('assets/png_fixture.png');";
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/bar/foo.js src/assets/png_fixture.png', { i: 'bar/foo', m: 'src/bar/foo.js' });
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    describe('importing the component', () => {
      before(() => {
        helper.tagAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      it('should create a symlink on node_modules pointing to the binary file', () => {
        const expectedDest = path.join(helper.localScopePath, 'components/bar/foo/node_modules/assets/png_fixture.png');
        expect(expectedDest).to.be.a.file();

        const symlinkValue = fs.readlinkSync(expectedDest);
        expect(symlinkValue).to.have.string(path.normalize('components/bar/foo/assets/png_fixture.png'));
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)('when installed via npm', () => {
        before(async () => {
          await npmCiRegistry.init();
          helper.importNpmPackExtension();
          helper.removeRemoteScope();
          npmCiRegistry.publishComponent('bar/foo');

          helper.reInitLocalScope();
          helper.runCmd('npm init -y');
          helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        it('should be able to install the package successfully and generate the symlink to the file', () => {
          const expectedDest = path.join(
            helper.localScopePath,
            `node_modules/@ci/${helper.remoteScope}.bar.foo/node_modules/assets/png_fixture.png`
          );
          expect(expectedDest).to.be.a.file();

          const symlinkValue = fs.readlinkSync(expectedDest);
          expect(symlinkValue).to.be.a.file();
        });
      });
    });
  });
  describe('using alias', () => {
    let scopeAfterAdding;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { aliases: { '@': 'src' } };
      helper.writeBitJson(bitJson);

      helper.createFile('src/utils', 'is-type.js', fixtures.isType);
      const isStringFixture =
        "const isType = require('@/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      const barFooFixture =
        "const isString = require('@/utils/is-string'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      helper.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo' });
      scopeAfterAdding = helper.cloneLocalScope();
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.showComponentParsed('bar/foo');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].importSource).to.equal('@/utils/is-string');
      expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
    });
    describe('when there is already a package with the same name of the alias and is possible to resolve to the package', () => {
      before(() => {
        helper.addNpmPackage('@'); // makes sure the package is there
        helper.outputFile('node_modules/@/utils/is-string.js', ''); // makes sure it's possible to resolve to the package
      });
      // @see https://github.com/teambit/bit/issues/1779
      it('should still resolve to the custom-resolve and not to the package', () => {
        const output = helper.showComponentParsed('bar/foo');
        expect(output.dependencies).to.have.lengthOf(1);
        const dependency = output.dependencies[0];
        expect(dependency.id).to.equal('utils/is-string');
        expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.js');
        expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.js');
        expect(dependency.relativePaths[0].importSource).to.equal('@/utils/is-string');
        expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
      });
    });
    describe('importing the component', () => {
      before(() => {
        helper.getClonedLocalScope(scopeAfterAdding);
        helper.tagAllComponents();
        helper.exportAllComponents();

        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      describe('deleting the link generated for the custom-module-resolution', () => {
        before(() => {
          fs.removeSync(path.join(helper.localScopePath, 'components/bar/foo/node_modules'));
        });
        it('bit status should show it as missing links and not as missing packages dependencies', () => {
          const output = helper.runCmd('bit status');
          expect(output).to.have.string('missing links');
          expect(output).to.not.have.string('missing packages dependencies');
        });
        describe('bit link', () => {
          let linkOutput;
          before(() => {
            linkOutput = helper.runCmd('bit link');
          });
          it.skip('should recreate the missing link', () => {
            // it doesn't show it for now, as it's not a symlink
            expect(linkOutput).to.have.string('components/bar/foo/node_modules/@/utils/is-string');
          });
          it('should recreate the links correctly', () => {
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
    });
  });
});
