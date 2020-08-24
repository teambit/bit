// covers init, tag, create, import commands and

import chai, { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';

import { AUTO_GENERATED_STAMP, IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as fixtures from '../../src/fixtures/fixtures';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

chai.use(require('chai-fs'));

describe('typescript', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('using typescript compiler', () => {
    let scopeWithTypescriptCompiler;
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.env.importTypescriptCompiler();
      scopeWithTypescriptCompiler = helper.scopeHelper.cloneLocalScope();
    });
    describe('components with auto-resolve dependencies - with ts compiler', () => {
      // Skipping this test on appveyor because it's fail due to madge issues
      if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
        // @ts-ignore
        this.skip;
      } else {
        /**
         * Directory structure of the author
         * bar/foo.js
         * utils/is-string.js
         * utils/is-type.js
         *
         * bar/foo depends on utils/is-string.
         * utils/is-string depends on utils/is-type
         *
         * There is babel compiler defined
         *
         * Expected structure after importing bar/foo in another project
         * components/bar/foo/bar/foo.ts
         * components/bar/foo/dist/bar/foo.js
         * components/bar/foo/index.js (generated index file - point to dist/bar/foo.js)
         * components/bar/foo/utils/is-string.ts (generated link file - point to components/.dependencies/utils/is-string/scope-name/version-number/utils/is-string.ts)
         * components/bar/foo/dist/utils/is-string.js (generated link file - point to index file of is-string component)
         * components/.dependencies/utils/is-string/scope-name/version-number/index.js (generated index file - point to dist/is-string.js)
         * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-string.ts
         * components/.dependencies/utils/is-string/scope-name/version-number/utils/is-type.ts (generated link file which enable is-string to use is-type)
         * components/.dependencies/utils/is-string/scope-name/version-number/dist/utils/is-type.js (link file which enable is-string to use is-type)
         * components/.dependencies/utils/is-string/scope-name/version-number/dist/utils/is-string.js (compiled version)
         * components/.dependencies/utils/is-type/scope-name/version-number/index.js (generated index file - point to dist/is-type.js)
         * components/.dependencies/utils/is-type/scope-name/version-number/utils/is-type.ts
         * components/.dependencies/utils/is-type/scope-name/version-number/dist/utils/is-type.js (compiled version)
         */
        let localConsumerFiles;
        let isStringPath;
        let isTypePath;
        before(() => {
          helper.scopeHelper.setNewLocalAndRemoteScopes();
          helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
          helper.scopeHelper.addRemoteScope();
          helper.fs.createFile('utils', 'is-type.ts', fixtures.isTypeTS);
          helper.command.addComponent('utils/is-type.ts', { i: 'utils/is-type' });
          const isStringFixture =
            "import isType from './is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
          helper.fs.createFile('utils', 'is-string.ts', isStringFixture);
          helper.command.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
          const fooBarFixture =
            "import isString from '../utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
          helper.fs.createFile('bar', 'foo.ts', fooBarFixture);
          helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
          localConsumerFiles = helper.fs.getConsumerFiles('*.{js,ts,json}');

          isStringPath = path.join('components', '.dependencies', 'utils', 'is-string', helper.scopes.remote, '0.0.1');
          isTypePath = path.join('components', '.dependencies', 'utils', 'is-type', helper.scopes.remote, '0.0.1');
        });
        it('should keep the original directory structure of the main component', () => {
          const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.ts');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should create the dist files of the main component', () => {
          const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'bar', 'foo.js');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should point the main file key in the component package.json to the dist main file', () => {
          const packageJsonFolder = path.join(helper.scopes.localPath, 'components', 'bar', 'foo');
          const packageJsonContent = helper.packageJson.read(packageJsonFolder);
          expect(packageJsonContent).to.deep.include({
            name: `@bit/${helper.scopes.remote}.bar.foo`,
            version: '0.0.1',
            main: 'dist/bar/foo.js',
          });
        });
        it('should not create an index.js file on the component root dir because it has package.json already', () => {
          const expectedLocation = path.join('components', 'bar', 'foo', 'index.js');
          expect(localConsumerFiles).to.not.include(expectedLocation);
        });
        it('should point the main file key in the is-string dependency package.json to the dist main file', () => {
          const packageJsonFolder = path.join(helper.scopes.localPath, isStringPath);
          const packageJsonContent = helper.packageJson.read(packageJsonFolder);
          expect(packageJsonContent).to.deep.include({
            name: `@bit/${helper.scopes.remote}.utils.is-string`,
            version: '0.0.1',
            main: 'dist/is-string.js',
          });
        });
        it('should point the main file key in the is-type dependency package.json to the dist main file', () => {
          const packageJsonFolder = path.join(helper.scopes.localPath, isTypePath);
          const packageJsonContent = helper.packageJson.read(packageJsonFolder);
          expect(packageJsonContent).to.deep.include({
            name: `@bit/${helper.scopes.remote}.utils.is-type`,
            version: '0.0.1',
            main: 'dist/is-type.js',
          });
        });
        it('should save the direct dependency nested to the main component', () => {
          const expectedLocation = path.join(isStringPath, 'is-string.ts');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
          const expectedLocation = path.join(isTypePath, 'is-type.ts');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should add dependencies dists files to file system', () => {
          const expectedIsTypeDistLocation = path.join(isTypePath, 'dist', 'is-type.js');
          const expectedIsStringDistLocation = path.join(isStringPath, 'dist', 'is-string.js');
          expect(localConsumerFiles).to.include(expectedIsTypeDistLocation);
          expect(localConsumerFiles).to.include(expectedIsStringDistLocation);
        });
        it('should link the direct dependency to its source file from main component source folder', () => {
          const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.ts');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should link the direct dependency to its index file from main component dist folder', () => {
          const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'utils', 'is-string.js');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should link the indirect dependency from dependent component source folder to its source file in the dependency directory', () => {
          const expectedLocation = path.join(isStringPath, 'is-type.ts');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should link the indirect dependency from dependent component dist folder to its index file in the dependency directory', () => {
          const expectedLocation = path.join(isStringPath, 'dist', 'is-type.js');
          expect(localConsumerFiles).to.include(expectedLocation);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      }
    });
    describe('with default and non default export', () => {
      if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
        // fails on AppVeyor for unknown reason ("spawnSync C:\Windows\system32\cmd.exe ENOENT").
        // @ts-ignore
        this.skip;
      } else {
        before(() => {
          helper.scopeHelper.setNewLocalAndRemoteScopes();
          helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
          helper.scopeHelper.addRemoteScope();
          const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
          helper.fs.createFile('utils', 'is-array.ts', isArrayFixture);
          helper.command.addComponent('utils/is-array.ts', { i: 'utils/is-array' });
          const isStringFixture =
            "export function isString() { return 'got is-string'; }; export function isString2() { return 'got is-string2'; };";
          helper.fs.createFile('utils', 'is-string.ts', isStringFixture);
          helper.command.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
          const fooBarFixture = `import isArray from '../utils/is-array';
    import { isString, isString2 } from '../utils/is-string';
    export default function foo() { return isArray() +  ' and ' + isString() +  ' and ' + isString2() + ' and got foo'; };`;
          helper.fs.createFile('bar', 'foo.ts', fooBarFixture);
          helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });

          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-array and got is-string and got is-string2 and got foo');
        });
        it('should be able to compile the main component with auto-generated .ts files without errors', () => {
          helper.env.importTypescriptCompiler();
          const barFooFile = path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'bar', 'foo.ts');
          const tscPath = helper.general.installAndGetTypeScriptCompilerDir();
          const result = helper.command.runCmd(`tsc ${barFooFile}`, tscPath);
          // in case of compilation error it throws an exception
          expect(result.trim()).to.equal('');
        });
      }
    });
    describe('with custom module resolution', () => {
      describe('using module directories', () => {
        let localScope;
        before(() => {
          helper.scopeHelper.setNewLocalAndRemoteScopes();
          helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
          helper.scopeHelper.addRemoteScope();
          const bitJson = helper.bitJson.read();
          bitJson.resolveModules = { modulesDirectories: ['src'] };
          helper.bitJson.write(bitJson);
          helper.fs.createFile('src/utils', 'is-type.ts', fixtures.isTypeTS);
          helper.command.addComponent('src/utils/is-type.ts', { i: 'utils/is-type' });
          const isStringFixture =
            "import isType from 'utils/is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
          helper.fs.createFile('src/utils', 'is-string.ts', isStringFixture);
          helper.command.addComponent('src/utils/is-string.ts', { i: 'utils/is-string' });
          const fooBarFixture =
            "import isString from 'utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
          helper.fs.createFile('src/bar', 'foo.ts', fooBarFixture);
          helper.command.addComponent('src/bar/foo.ts', { i: 'bar/foo' });
          localScope = helper.scopeHelper.cloneLocalScope();
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
          expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.ts');
          expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.ts');
          expect(dependency.relativePaths[0].importSource).to.equal('utils/is-string');
          expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
        });
        describe('export and import the component to a new scope', () => {
          before(() => {
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('bar/foo');
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
            fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
        });

        (supportNpmCiRegistryTesting ? describe : describe.skip)(
          'installing dependencies as packages (not as components)',
          () => {
            let npmCiRegistry: NpmCiRegistry;
            before(async () => {
              npmCiRegistry = new NpmCiRegistry(helper);
              helper.scopeHelper.getClonedLocalScope(localScope);
              helper.scopeHelper.reInitRemoteScope();
              npmCiRegistry.setCiScopeInBitJson();
              helper.command.tagAllComponents();
              helper.command.exportAllComponents();

              await npmCiRegistry.init();
              npmCiRegistry.publishEntireScope();

              helper.scopeHelper.reInitLocalScope();
              npmCiRegistry.setCiScopeInBitJson();
              npmCiRegistry.setResolver();
              helper.command.importComponent('utils/is-string');
            });
            after(() => {
              npmCiRegistry.destroy();
            });
            it('should be able to require its direct dependency and print results from all dependencies', () => {
              // this makes sure that when generating npm links with custom-resolved-modules
              // and there are dist files, it doesn't generate an un-compiled .ts file, but a .js file
              const appJsFixture =
                "const isString = require('./components/utils/is-string'); console.log(isString.default());";
              fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
              const result = helper.command.runCmd('node app.js');
              expect(result.trim()).to.equal('got is-type and got is-string');
            });
          }
        );
      });
      describe('using aliases', () => {
        let scopeAfterAdding;
        before(() => {
          helper.scopeHelper.setNewLocalAndRemoteScopes();
          helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
          helper.scopeHelper.addRemoteScope();
          const bitJson = helper.bitJson.read();
          bitJson.resolveModules = { aliases: { '@': 'src' } };
          helper.bitJson.write(bitJson);

          helper.fs.createFile('src/utils', 'is-type.ts', fixtures.isTypeTS);
          helper.command.addComponent('src/utils/is-type.ts', { i: 'utils/is-type' });
          const isStringFixture =
            "import isType from '@/utils/is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
          helper.fs.createFile('src/utils', 'is-string.ts', isStringFixture);
          helper.command.addComponent('src/utils/is-string.ts', { i: 'utils/is-string' });
          const fooBarFixture =
            "import isString from '@/utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
          helper.fs.createFile('src/bar', 'foo.ts', fooBarFixture);
          helper.command.addComponent('src/bar/foo.ts', { i: 'bar/foo' });
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
          expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.ts');
          expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.ts');
          expect(dependency.relativePaths[0].importSource).to.equal('@/utils/is-string');
          expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
        });
        describe('importing the component', () => {
          before(() => {
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('bar/foo');
          });
          it('should generate the custom-resolve links correctly and be able to require the components', () => {
            const appJsFixture = `const barFoo = require('@bit/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`;
            fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
            const result = helper.command.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string and got foo');
          });
          it('should create index.d.ts file along with the index.js file inside the node_modules/custom-resolve', () => {
            const expectedPath = path.join(
              helper.scopes.localPath,
              'components/bar/foo/node_modules/@/utils/is-string/index.d.ts'
            );
            expect(expectedPath).to.be.a.file();
          });
        });
        describe('using bundler compiler that generates a dist file with a different name than the source', () => {
          before(() => {
            helper.scopeHelper.getClonedLocalScope(scopeAfterAdding);
            helper.env.importDummyCompiler('bundle');
            helper.command.tagAllComponents();
            helper.scopeHelper.reInitRemoteScope();
            helper.command.exportAllComponents();
            helper.scopeHelper.reInitLocalScope();
            helper.scopeHelper.addRemoteScope();
            helper.command.importComponent('bar/foo');
          });
          it('should generate the link inside node_modules with .js extension and not .ts', () => {
            const expectedFile = path.join(
              helper.scopes.localPath,
              'components/bar/foo/node_modules/@/utils/is-string/index.js'
            );
            expect(expectedFile).to.be.a.file();
            const notExpectedFile = path.join(
              helper.scopes.localPath,
              'components/bar/foo/node_modules/@/utils/is-string/index.ts'
            );
            expect(notExpectedFile).not.to.be.a.path();
          });
        });
      });
    });
    describe('when dist is outside the components dir', () => {
      let npmCiRegistry: NpmCiRegistry;
      before(() => {
        npmCiRegistry = new NpmCiRegistry(helper);
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
        npmCiRegistry.setCiScopeInBitJson();
        helper.scopeHelper.addRemoteScope();
        helper.fs.createFile('utils', 'is-type.ts', fixtures.isTypeTS);
        helper.command.addComponent('utils/is-type.ts', { i: 'utils/is-type' });
        helper.fs.createFile('utils', 'is-string.ts', fixtures.isStringTS);
        helper.command.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
        helper.fs.createFile('bar', 'foo.ts', fixtures.barFooTS);
        helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
        helper.command.importComponent('bar/foo');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
        before(async () => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
          await npmCiRegistry.init();
          helper.scopeHelper.removeRemoteScope();
          npmCiRegistry.unpublishComponent('bar.foo');
          npmCiRegistry.unpublishComponent('utils.is-string');
          npmCiRegistry.unpublishComponent('utils.is-type');
          npmCiRegistry.publishComponent('utils/is-type');
          npmCiRegistry.publishComponent('utils/is-string');
          npmCiRegistry.publishComponent('bar/foo');
        });
        after(() => {
          npmCiRegistry.destroy();
        });
        function runAppJs() {
          const appJsFixture = `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`;
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        }
        describe('installing a component using NPM', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            helper.command.runCmd('npm init -y');
            helper.command.runCmd(`npm install @ci/${helper.scopes.remote}.bar.foo`);
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            runAppJs();
          });
        });
        describe('importing a component using Bit', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScope();
            npmCiRegistry.setCiScopeInBitJson();
            npmCiRegistry.setResolver();
            // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
            helper.bitJson.modifyField('dist', { target: 'dist', entry: 'src' });
            helper.command.importComponent('bar/foo');
          });
          it('package.json of the dist should point to the dist file with .js extension (not .ts)', () => {
            const packageJson = helper.packageJson.read(path.join(helper.scopes.localPath, 'dist/components/bar/foo'));
            expect(packageJson.main).to.equal('bar/foo.js');
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            runAppJs();
          });
          describe('ejecting the component', () => {
            before(() => {
              helper.command.ejectComponents('bar/foo');
            });
            it('should delete also the dist directory', () => {
              expect(path.join(helper.scopes.localPath, 'dist/components/bar')).to.not.be.a.path();
            });
          });
        });
      });
    });
    describe('requiring an internal file', () => {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
        helper.scopeHelper.addRemoteScope();
        helper.fs.createFile('src/utils', 'is-type.ts', '');
        helper.fs.createFile('src/utils', 'is-type-internal.ts', fixtures.isTypeTS);
        helper.command.addComponent('src/utils/is-type.ts src/utils/is-type-internal.ts', {
          i: 'utils/is-type',
          m: 'src/utils/is-type.ts',
        });

        const isStringFixture =
          "import isType from './is-type-internal'; export default function isString() { return isType() +  ' and got is-string'; };";
        helper.fs.createFile('src/utils', 'is-string.ts', '');
        helper.fs.createFile('src/utils', 'is-string-internal.ts', isStringFixture);
        helper.command.addComponent('src/utils/is-string.ts src/utils/is-string-internal.ts', {
          i: 'utils/is-string',
          m: 'src/utils/is-string.ts',
        });

        const barFooFixture =
          "import isString from '../utils/is-string-internal'; export default function foo() { return isString() + ' and got foo'; };";
        helper.fs.createFile('src/bar', 'foo.ts', barFooFixture);
        helper.command.addComponent('src/bar/foo.ts', { i: 'bar/foo', m: 'src/bar/foo.ts' });
        helper.command.tagAllComponents();

        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should be able to require the main and the internal files and print the results', () => {
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), fixtures.appPrintBarFooES6);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    });
    // tests https://github.com/teambit/bit/issues/2140
    describe('using syntax of "import { x as y }', () => {
      let tscResult;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
        helper.scopeHelper.addRemoteScope();
        helper.fs.outputFile('foo.ts', 'export function foo(){}');
        helper.fs.outputFile('bar.ts', 'import { foo as foo1 } from "./foo"; console.log(foo1);');
        helper.command.addComponent('foo.ts');
        helper.command.addComponent('bar.ts');
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.scopeHelper.addGlobalRemoteScope();
        helper.command.importComponent('bar');
        const tscPath = helper.general.installAndGetTypeScriptCompilerDir();
        const barFile = path.join(helper.scopes.localPath, 'components/bar/bar.ts');
        tscResult = helper.general.runWithTryCatch(`tsc ${barFile}`, tscPath);
      });
      it('should not throw an error when running tsc on the imported files with the generated links', () => {
        // in case of compilation error it throws an exception
        expect(tscResult.trim()).to.equal('');
      });
    });
    describe('a component of d.ts file required by another component', () => {
      let localScope;
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.scopeHelper.getClonedLocalScope(scopeWithTypescriptCompiler);
        helper.scopeHelper.addRemoteScope();
        helper.fs.outputFile('types.d.ts', 'export interface Api {};');
        helper.fs.outputFile('foo.ts', 'import {Api} from "./types"; console.log(Api);');
        helper.command.addComponent('types.d.ts');
        helper.command.addComponent('foo.ts');
        localScope = helper.scopeHelper.cloneLocalScope();
      });
      describe('installing dependencies as components', () => {
        before(() => {
          helper.command.tagAllComponents();
          helper.command.exportAllComponents();
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('foo');
        });
        it('should create a link to the d.ts file', () => {
          const fileContent = helper.fs.readFile('components/foo/types.d.ts');
          expect(fileContent).to.have.string(AUTO_GENERATED_STAMP);
        });
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)(
        'installing dependencies as packages (not as components)',
        () => {
          let npmCiRegistry: NpmCiRegistry;
          before(async () => {
            npmCiRegistry = new NpmCiRegistry(helper);
            helper.scopeHelper.getClonedLocalScope(localScope);
            helper.scopeHelper.reInitRemoteScope();
            npmCiRegistry.setCiScopeInBitJson();
            helper.command.tagAllComponents();
            helper.command.exportAllComponents();

            await npmCiRegistry.init();
            npmCiRegistry.publishEntireScope();

            helper.scopeHelper.reInitLocalScope();
            npmCiRegistry.setCiScopeInBitJson();
            npmCiRegistry.setResolver();
            helper.command.importComponent('foo');
          });
          after(() => {
            npmCiRegistry.destroy();
          });
          it('should create a link to the d.ts file', () => {
            // a previous bug threw an error here of "failed to generate a symlink".
            const fileContent = helper.fs.readFile('components/foo/types.d.ts');
            expect(fileContent).to.have.string(AUTO_GENERATED_STAMP);
          });
        }
      );
    });
  });
  describe('react style => .tsx extension', () => {
    if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
      // @ts-ignore
      this.skip;
    } else {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        const listFixture = `import {Item} from '../item/item';
/**
 * Awesome List React component.
 */
export class List extends React.Component {
    public render() {
        return (
            <ul data-automation-id="LIST">
                <Item />
                <Item />
                <Item />
            </ul>
        );
    }
}
`;
        const itemFixture = '';
        helper.fs.createFile('list', 'list.tsx', listFixture);
        helper.fs.createFile('item', 'item.tsx', itemFixture);
        helper.command.addComponent('list/list.tsx', { i: 'list/list' });
        helper.command.addComponent('item/item.tsx', { i: 'item/item' });
      });
      it('should be able to parse .tsx syntax successfully and recognize the dependencies', () => {
        const output = helper.command.showComponent('list/list --json');
        const outputParsed = JSON.parse(output);
        expect(outputParsed.dependencies).to.have.lengthOf(1);
        expect(outputParsed.dependencies[0].id).to.equal('item/item');
      });
    }
  });
  describe('auto recognizing @types packages', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.npm.initNpm();
      helper.fs.createFile('bar', 'foo.ts', "import { yo } from 'ninja';");
      helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });
      helper.npm.addNpmPackage('ninja', '13.0.0');
      helper.npm.addNpmPackage('@types/ninja', '1.0.0');
      helper.packageJson.addKeyValue({ dependencies: { ninja: '13.0.0' } });
      helper.packageJson.addKeyValue({ devDependencies: { '@types/ninja': '1.0.0' } });
    });
    it('should find the @types in the package.json file and automatically add it to the dependencies', () => {
      const show = helper.command.showComponentParsed();
      expect(show.devPackageDependencies).to.deep.equal({ '@types/ninja': '1.0.0' });
    });
    describe('when the types package set to be ignored in the overrides', () => {
      before(() => {
        const overrides = {
          'bar/foo': {
            devDependencies: {
              '@types/ninja': '-',
            },
          },
        };
        helper.bitJson.addOverrides(overrides);
      });
      it('should not show the @types package anymore', () => {
        const show = helper.command.showComponentParsed();
        expect(show.devPackageDependencies).to.not.have.property('@types/ninja');
      });
    });
  });
});
