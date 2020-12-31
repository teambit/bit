import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('custom module resolutions', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('using custom module directory', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.bitJson.write(bitJson);

      helper.fs.createFile('src/utils', 'is-type.js', fixtures.isType);
      const isStringFixture =
        "const isType = require('utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      const barFooFixture =
        "const isString = require('utils/is-string'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
      helper.command.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      helper.command.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo' });
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.command.showComponentParsed('bar/foo');
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
        capsuleDir = helper.general.generateRandomTmpDirName();
        helper.command.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      });
      it('should not delete the dependencies file paths', () => {
        const packageJson = helper.packageJson.read(capsuleDir);
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
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      it('should add the resolve aliases mapping into package.json for the pnp feature', () => {
        const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'components/bar/foo'));
        expect(packageJson).to.have.property('bit');
        expect(packageJson.bit).to.have.property('resolveAliases');
        expect(packageJson.bit.resolveAliases).to.have.property('utils/is-string');
        expect(packageJson.bit.resolveAliases['utils/is-string']).to.equal(
          `@bit/${helper.scopes.remote}.utils.is-string`
        );
      });
      describe('importing the component using isolated environment', () => {
        let isolatePath;
        before(() => {
          isolatePath = helper.command.isolateComponent('bar/foo', '-olws');
        });
        it('should be able to generate the links correctly and require the dependencies', () => {
          const appJsFixture = `const barFoo = require('./');
  console.log(barFoo());`;
          helper.command.runCmd('npm run postinstall', isolatePath);
          const isStringPath = path.join(
            isolatePath,
            'node_modules',
            '@bit',
            `${helper.scopes.remote}.utils.is-string`
          );
          helper.command.runCmd('npm run postinstall', isStringPath);
          fs.outputFileSync(path.join(isolatePath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js', isolatePath);
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
      describe('npm packing the component using an extension pack', () => {
        let packDir;
        let untarDir;
        before(() => {
          packDir = path.join(helper.scopes.localPath, 'pack');
          untarDir = path.join(packDir, 'package');
          const componentId = `${helper.scopes.remote}/bar/foo`;
          const options = {
            d: packDir,
          };
          helper.command.packComponent(componentId, options, true);
        });
        it('should create the specified directory', () => {
          expect(untarDir).to.be.a.path();
        });
        it('should generate .bit.postinstall.js file', () => {
          expect(path.join(untarDir, '.bit.postinstall.js')).to.be.a.file();
        });
        it('should add the postinstall script to the package.json file', () => {
          const packageJson = helper.packageJson.read(untarDir);
          expect(packageJson).to.have.property('scripts');
          expect(packageJson.scripts).to.have.property('postinstall');
          expect(packageJson.scripts.postinstall).to.equal('node .bit.postinstall.js');
        });
        it('should add the resolve aliases mapping into package.json for the pnp feature', () => {
          const packageJson = helper.packageJson.read(untarDir);
          expect(packageJson).to.have.property('bit');
          expect(packageJson.bit).to.have.property('resolveAliases');
          expect(packageJson.bit.resolveAliases).to.have.property('utils/is-string');
          expect(packageJson.bit.resolveAliases['utils/is-string']).to.equal(
            `@bit/${helper.scopes.remote}.utils.is-string`
          );
        });
      });
      describe('importing the component into Harmony workspace', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScopeHarmony();
          helper.scopeHelper.addRemoteScope();
        });
        it('should not throw an error on import', () => {
          expect(() => helper.command.importComponent('bar/foo')).to.not.throw();
        });
      });
    });
  });
  describe('using custom module directory when two files in the same component requires each other', () => {
    describe('with dependencies', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        const bitJson = helper.bitJson.read();
        bitJson.resolveModules = { modulesDirectories: ['src'] };
        helper.bitJson.write(bitJson);

        helper.fs.createFile('src/utils', 'is-type.js', fixtures.isType);
        const isStringFixture =
          "const isType = require('utils/is-type');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
        const barFooFixture =
          "const isString = require('utils/is-string');\n module.exports = function foo() { return isString() + ' and got foo'; };";
        helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
        helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
        helper.command.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
        helper.command.addComponent('src/bar/foo.js src/utils/is-string.js', {
          i: 'bar/foo',
          m: 'src/bar/foo.js',
        });
      });
      it('bit status should not warn about missing packages', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('missing');
      });
      it('bit show should show the dependencies correctly', () => {
        const output = helper.command.showComponentParsed('bar/foo');
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
          helper.command.tagAllComponents();
          // an intermediate step, make sure it saves the customResolvedPaths in the model
          const catComponent = helper.command.catComponent('bar/foo@latest');
          expect(catComponent).to.have.property('customResolvedPaths');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.customResolvedPaths[0].destinationPath).to.equal('src/utils/is-string.js');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          expect(catComponent.customResolvedPaths[0].importSource).to.equal('utils/is-string');
          helper.command.exportAllComponents();

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
        });
        it('should generate the non-relative links correctly', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        it('should not show the component as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.string('modified');
        });
      });
    });
    describe('without dependencies', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        const bitJson = helper.bitJson.read();
        bitJson.resolveModules = { modulesDirectories: ['src'] };
        helper.bitJson.write(bitJson);

        helper.fs.createFile('src/utils', 'is-type.js', fixtures.isType);
        const isStringFixture =
          "const isType = require('utils/is-type');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
        const barFooFixture =
          "const isString = require('utils/is-string');\n module.exports = function foo() { return isString() + ' and got foo'; };";
        helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
        helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
        helper.command.addComponent('src', { i: 'bar/foo', m: 'src/bar/foo.js' });
        helper.command.tagAllComponents();
      });
      it('bit status should not warn about missing packages', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('missing');
      });
      it('should show the customResolvedPaths correctly', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        expect(barFoo).to.have.property('customResolvedPaths');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.customResolvedPaths).to.have.lengthOf(2);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.customResolvedPaths).to.deep.include({
          destinationPath: 'src/utils/is-string.js',
          importSource: 'utils/is-string',
        });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.customResolvedPaths).to.deep.include({
          destinationPath: 'src/utils/is-type.js',
          importSource: 'utils/is-type',
        });
      });
      describe('importing the component', () => {
        before(() => {
          helper.command.exportAllComponents();

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
        });
        it('should generate the non-relative links correctly', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        it('should not show the component as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.string('modified');
        });
        describe('npm packing the component using an extension pack', () => {
          let packDir;
          let untarDir;
          before(() => {
            packDir = path.join(helper.scopes.localPath, 'pack');
            untarDir = path.join(packDir, 'package');
            const componentId = `${helper.scopes.remote}/bar/foo`;
            const options = {
              d: packDir,
            };
            helper.command.packComponent(componentId, options, true);
          });
          it('should create the specified directory', () => {
            expect(untarDir).to.be.a.path();
          });
          it('should generate .bit.postinstall.js file', () => {
            expect(path.join(untarDir, '.bit.postinstall.js')).to.be.a.file();
          });
          it('should add the postinstall script to the package.json file', () => {
            const packageJson = helper.packageJson.read(untarDir);
            expect(packageJson).to.have.property('scripts');
            expect(packageJson.scripts).to.have.property('postinstall');
            expect(packageJson.scripts.postinstall).to.equal('node .bit.postinstall.js');
          });
          it('npm install should create the custom-resolved dir inside node_modules', () => {
            helper.command.runCmd('npm i', untarDir);
            expect(path.join(untarDir, 'node_modules/utils/is-string.js')).to.be.a.file();
            expect(path.join(untarDir, 'node_modules/utils/is-type.js')).to.be.a.file();
            expect(() => helper.command.runCmd(`node ${untarDir}/bar/foo.js`)).to.not.throw();
          });
          it('should add the resolve aliases mapping into package.json for the pnp feature', () => {
            const packageJson = helper.packageJson.read(untarDir);
            const packageName = helper.general.getRequireBitPath('bar', 'foo');
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
    // see https://github.com/teambit/bit/issues/2006 for a bug about it.
    describe('when one alias is a parent of another one', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        const bitJson = helper.bitJson.read();
        bitJson.resolveModules = { aliases: { '@': 'src' } };
        helper.bitJson.write(bitJson);

        helper.fs.createFile('src/utils', 'is-type.js', fixtures.isType);
        const isStringFixture =
          "const isType = require('@/utils/is-type');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
        const barFooFixture =
          "const isString = require('@/utils');\n module.exports = function foo() { return isString() + ' and got foo'; };";
        const indexFixture = "module.exports = require('./is-string');";
        helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
        helper.fs.createFile('src/utils', 'index.js', indexFixture);
        helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
        helper.command.addComponent('src', { i: 'bar/foo', m: 'src/bar/foo.js' });
        helper.command.tagAllComponents();
      });
      it('bit status should not warn about missing packages', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('missing');
      });
      it('should show the customResolvedPaths correctly', () => {
        const barFoo = helper.command.catComponent('bar/foo@latest');
        expect(barFoo).to.have.property('customResolvedPaths');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.customResolvedPaths).to.have.lengthOf(2);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.customResolvedPaths).to.deep.include({
          destinationPath: 'src/utils/index.js',
          importSource: '@/utils',
        });
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(barFoo.customResolvedPaths).to.deep.include({
          destinationPath: 'src/utils/is-type.js',
          importSource: '@/utils/is-type',
        });
      });
      describe('importing the component', () => {
        before(() => {
          helper.command.exportAllComponents();

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
        });
        it('should generate the non-relative links correctly', () => {
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
        it('should not show the component as modified', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.not.have.string('modified');
        });
        describe('npm packing the component using an extension pack', () => {
          let packDir;
          let untarDir;
          before(() => {
            packDir = path.join(helper.scopes.localPath, 'pack');
            untarDir = path.join(packDir, 'package');
            const componentId = `${helper.scopes.remote}/bar/foo`;
            const options = {
              d: packDir,
            };
            helper.command.packComponent(componentId, options, true);
          });
          it('should create the specified directory', () => {
            expect(untarDir).to.be.a.path();
          });
          it('should generate .bit.postinstall.js file', () => {
            expect(path.join(untarDir, '.bit.postinstall.js')).to.be.a.file();
          });
          it('should add the postinstall script to the package.json file', () => {
            const packageJson = helper.packageJson.read(untarDir);
            expect(packageJson).to.have.property('scripts');
            expect(packageJson.scripts).to.have.property('postinstall');
            expect(packageJson.scripts.postinstall).to.equal('node .bit.postinstall.js');
          });
          it('npm install should create the custom-resolved dir inside node_modules', () => {
            helper.command.runCmd('npm i', untarDir);
            expect(path.join(untarDir, 'node_modules/@/utils/index.js')).to.be.a.file();
            expect(path.join(untarDir, 'node_modules/@/utils/is-type.js')).to.be.a.file();
            expect(() => helper.command.runCmd(`node ${untarDir}/bar/foo.js`)).to.not.throw();
          });
          it('should add the resolve aliases mapping into package.json for the pnp feature', () => {
            const packageJson = helper.packageJson.read(untarDir);
            const packageName = helper.general.getRequireBitPath('bar', 'foo');
            expect(packageJson.bit.resolveAliases)
              .to.have.property('@/utils')
              .that.equal(`${packageName}/utils/index.js`);
            expect(packageJson.bit.resolveAliases)
              .to.have.property('@/utils/is-type')
              .that.equal(`${packageName}/utils/is-type.js`);
          });
        });
      });
    });
  });
  describe('using custom module directory when a component uses an internal file of another component', () => {
    let npmCiRegistry;
    before(() => {
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.bitJson.write(bitJson);
      npmCiRegistry.setCiScopeInBitJson();
      helper.fs.createFile('src/utils', 'is-type.js', '');
      helper.fs.createFile('src/utils', 'is-type-internal.js', fixtures.isType);
      helper.command.addComponent('src/utils/is-type.js src/utils/is-type-internal.js', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.js',
      });

      const isStringFixture =
        "const isType = require('utils/is-type-internal');\n module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('src/utils', 'is-string.js', '');
      helper.fs.createFile('src/utils', 'is-string-internal.js', isStringFixture);
      helper.command.addComponent('src/utils/is-string.js src/utils/is-string-internal.js', {
        i: 'utils/is-string',
        m: 'src/utils/is-string.js',
      });

      const barFooFixture =
        "const isString = require('utils/is-string-internal');\n module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo', m: 'src/bar/foo.js' });
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.command.showComponentParsed('bar/foo');
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
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
        before(async () => {
          await npmCiRegistry.init();
          helper.scopeHelper.removeRemoteScope();
          npmCiRegistry.publishComponent('utils/is-type');
          npmCiRegistry.publishComponent('utils/is-string');
          npmCiRegistry.publishComponent('bar/foo');

          helper.scopeHelper.reInitLocalScope();
          helper.command.runCmd('npm init -y');
          helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo());`;
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
    });
  });
  describe('using custom module directory when a component uses an internal binary file of the same component', () => {
    let npmCiRegistry;
    before(() => {
      helper = new Helper();
      helper.command.setFeatures('legacy-workspace-config');
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.bitJson.write(bitJson);
      npmCiRegistry.setCiScopeInBitJson();

      const sourcePngFile = path.join(__dirname, '..', 'fixtures', 'png_fixture.png');
      const destPngFile = path.join(helper.scopes.localPath, 'src/assets', 'png_fixture.png');
      fs.copySync(sourcePngFile, destPngFile);
      const barFooFixture = "require('assets/png_fixture.png');";
      helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
      helper.command.addComponent('src/bar/foo.js src/assets/png_fixture.png', {
        i: 'bar/foo',
        m: 'src/bar/foo.js',
      });
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    describe('importing the component', () => {
      before(() => {
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      it('should create a symlink on node_modules pointing to the binary file', () => {
        const expectedDest = path.join(
          helper.scopes.localPath,
          'components/bar/foo/node_modules/assets/png_fixture.png'
        );
        expect(expectedDest).to.be.a.file();

        const symlinkValue = fs.readlinkSync(expectedDest);
        expect(symlinkValue).to.have.string(path.normalize('components/bar/foo/assets/png_fixture.png'));
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)('when installed via npm', () => {
        before(async () => {
          await npmCiRegistry.init();
          helper.scopeHelper.removeRemoteScope();
          npmCiRegistry.publishComponent('bar/foo');

          helper.scopeHelper.reInitLocalScope();
          helper.command.runCmd('npm init -y');
          helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        it('should be able to install the package successfully and generate the symlink to the file', () => {
          const expectedDest = path.join(
            helper.scopes.localPath,
            `node_modules/@ci/${helper.scopes.remote}.bar.foo/node_modules/assets/png_fixture.png`
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
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { aliases: { '@': 'src' } };
      helper.bitJson.write(bitJson);

      helper.fs.createFile('src/utils', 'is-type.js', fixtures.isType);
      const isStringFixture =
        "const isType = require('@/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      const barFooFixture =
        "const isString = require('@/utils/is-string'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.fs.createFile('src/bar', 'foo.js', barFooFixture);
      helper.command.addComponent('src/utils/is-type.js', { i: 'utils/is-type' });
      helper.command.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo' });
      scopeAfterAdding = helper.scopeHelper.cloneLocalScope();
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.command.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.command.showComponentParsed('bar/foo');
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
        helper.npm.addNpmPackage('@'); // makes sure the package is there
        helper.fs.outputFile('node_modules/@/utils/is-string.js', ''); // makes sure it's possible to resolve to the package
      });
      // @see https://github.com/teambit/bit/issues/1779
      it('should still resolve to the custom-resolve and not to the package', () => {
        const output = helper.command.showComponentParsed('bar/foo');
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
        helper.scopeHelper.getClonedLocalScope(scopeAfterAdding);
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFoo);
      });
      it('should generate the non-relative links correctly', () => {
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      it('should not show the component as modified', () => {
        const output = helper.command.runCmd('bit status');
        expect(output).to.not.have.string('modified');
      });
      describe('deleting the link generated for the custom-module-resolution', () => {
        before(() => {
          fs.removeSync(path.join(helper.scopes.localPath, 'components/bar/foo/node_modules'));
        });
        it('bit status should show it as missing links and not as missing package dependencies', () => {
          const output = helper.command.runCmd('bit status');
          expect(output).to.have.string('missing links');
          expect(output).to.not.have.string('missing package dependencies');
        });
        describe('bit link', () => {
          let linkOutput;
          before(() => {
            linkOutput = helper.command.runCmd('bit link');
          });
          it.skip('should recreate the missing link', () => {
            // it doesn't show it for now, as it's not a symlink
            expect(linkOutput).to.have.string('components/bar/foo/node_modules/@/utils/is-string');
          });
          it('should recreate the links correctly', () => {
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });
      });
    });
  });
});
