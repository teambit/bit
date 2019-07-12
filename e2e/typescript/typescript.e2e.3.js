// covers init, tag, create, import commands and

import path from 'path';
import fs from 'fs-extra';
import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import BitsrcTester, { username, supportTestingOnBitsrc } from '../bitsrc-tester';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

const helper = new Helper();

describe('typescript', function () {
  this.timeout(0);
  let scopeWithTypescriptCompiler;
  before(() => {
    helper.reInitLocalScope();
    helper.importCompiler('bit.envs/compilers/react-typescript');
    scopeWithTypescriptCompiler = helper.cloneLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });

  // This is one of the most important cases, because it involve a lot of working pieces from the base flow:
  // Add, build, tag, export, import, dependency resolution, index file generation
  describe('components with auto-resolve dependencies - with ts compiler', () => {
    // Skipping this test on appveyor because it's fail due to madge issues
    if (process.env.APPVEYOR === 'True') {
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
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.getClonedLocalScope(scopeWithTypescriptCompiler);
        helper.addRemoteScope();
        const isTypeFixture = "export default function isType() { return 'got is-type'; };";
        helper.createFile('utils', 'is-type.ts', isTypeFixture);
        helper.addComponent('utils/is-type.ts', { i: 'utils/is-type' });
        const isStringFixture =
          "import isType from './is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
        helper.createFile('utils', 'is-string.ts', isStringFixture);
        helper.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
        const fooBarFixture =
          "import isString from '../utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
        helper.createFile('bar', 'foo.ts', fooBarFixture);
        helper.addComponent('bar/foo.ts', { i: 'bar/foo' });
        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        localConsumerFiles = helper.getConsumerFiles('*.{js,ts,json}');
      });
      const isStringPath = path.join('components', '.dependencies', 'utils', 'is-string', helper.remoteScope, '0.0.1');
      const isTypePath = path.join('components', '.dependencies', 'utils', 'is-type', helper.remoteScope, '0.0.1');
      it('should keep the original directory structure of the main component', () => {
        const expectedLocation = path.join('components', 'bar', 'foo', 'bar', 'foo.ts');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should create the dist files of the main component', () => {
        const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'bar', 'foo.js');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should point the main file key in the component package.json to the dist main file', () => {
        const packageJsonFolder = path.join(helper.localScopePath, 'components', 'bar', 'foo');
        const packageJsonContent = helper.readPackageJson(packageJsonFolder);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.bar.foo`,
          version: '0.0.1',
          main: 'dist/bar/foo.js'
        });
      });
      it('should not create an index.js file on the component root dir because it has package.json already', () => {
        const expectedLocation = path.join('components', 'bar', 'foo', 'index.js');
        expect(localConsumerFiles).to.not.include(expectedLocation);
      });
      it('should point the main file key in the is-string dependency package.json to the dist main file', () => {
        const packageJsonFolder = path.join(helper.localScopePath, isStringPath);
        const packageJsonContent = helper.readPackageJson(packageJsonFolder);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.utils.is-string`,
          version: '0.0.1',
          main: 'dist/is-string.js'
        });
      });
      it('should point the main file key in the is-type dependency package.json to the dist main file', () => {
        const packageJsonFolder = path.join(helper.localScopePath, isTypePath);
        const packageJsonContent = helper.readPackageJson(packageJsonFolder);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.utils.is-type`,
          version: '0.0.1',
          main: 'dist/is-type.js'
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
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      });
    }
  });
  describe('react style => .tsx extension', () => {
    if (process.env.APPVEYOR === 'True') {
      this.skip;
    } else {
      before(() => {
        helper.reInitLocalScope();
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
        helper.createFile('list', 'list.tsx', listFixture);
        helper.createFile('item', 'item.tsx', itemFixture);
        helper.addComponent('list/list.tsx', { i: 'list/list' });
        helper.addComponent('item/item.tsx', { i: 'item/item' });
      });
      it('should be able to parse .tsx syntax successfully and recognize the dependencies', () => {
        const output = helper.showComponent('list/list --json');
        const outputParsed = JSON.parse(output);
        expect(outputParsed.dependencies).to.have.lengthOf(1);
        expect(outputParsed.dependencies[0].id).to.equal('item/item');
      });
    }
  });
  describe('with default and non default export', () => {
    if (process.env.APPVEYOR === 'True') {
      // fails on AppVeyor for unknown reason ("spawnSync C:\Windows\system32\cmd.exe ENOENT").
      this.skip;
    } else {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.getClonedLocalScope(scopeWithTypescriptCompiler);
        helper.addRemoteScope();
        const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
        helper.createFile('utils', 'is-array.ts', isArrayFixture);
        helper.addComponent('utils/is-array.ts', { i: 'utils/is-array' });
        const isStringFixture =
          "export function isString() { return 'got is-string'; }; export function isString2() { return 'got is-string2'; };";
        helper.createFile('utils', 'is-string.ts', isStringFixture);
        helper.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
        const fooBarFixture = `import isArray from '../utils/is-array';
  import { isString, isString2 } from '../utils/is-string';
  export default function foo() { return isArray() +  ' and ' + isString() +  ' and ' + isString2() + ' and got foo'; };`;
        helper.createFile('bar', 'foo.ts', fooBarFixture);
        helper.addComponent('bar/foo.ts', { i: 'bar/foo' });

        helper.tagAllComponents();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-array and got is-string and got is-string2 and got foo');
      });
      it('should be able to compile the main component with auto-generated .ts files without errors', () => {
        helper.importCompiler('bit.envs/compilers/react-typescript');
        const barFooFile = path.join(helper.localScopePath, 'components', 'bar', 'foo', 'bar', 'foo.ts');
        const tscPath = helper.installAndGetTypeScriptCompilerDir();
        const result = helper.runCmd(`tsc ${barFooFile}`, tscPath);
        // in case of compilation error it throws an exception
        expect(result.trim()).to.equal('');
      });
    }
  });
  describe('with custom module resolution', () => {
    describe('using module directories', () => {
      let localScope;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.getClonedLocalScope(scopeWithTypescriptCompiler);
        helper.addRemoteScope();
        const bitJson = helper.readBitJson();
        bitJson.resolveModules = { modulesDirectories: ['src'] };
        helper.writeBitJson(bitJson);
        const isTypeFixture = "export default function isType() { return 'got is-type'; };";
        helper.createFile('src/utils', 'is-type.ts', isTypeFixture);
        helper.addComponent('src/utils/is-type.ts', { i: 'utils/is-type' });
        const isStringFixture =
          "import isType from 'utils/is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
        helper.createFile('src/utils', 'is-string.ts', isStringFixture);
        helper.addComponent('src/utils/is-string.ts', { i: 'utils/is-string' });
        const fooBarFixture =
          "import isString from 'utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
        helper.createFile('src/bar', 'foo.ts', fooBarFixture);
        helper.addComponent('src/bar/foo.ts', { i: 'bar/foo' });
        localScope = helper.cloneLocalScope();
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
        expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.ts');
        expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.ts');
        expect(dependency.relativePaths[0].importSource).to.equal('utils/is-string');
        expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
      });
      describe('export and import the component to a new scope', () => {
        before(() => {
          helper.tagAllComponents();
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
      (supportTestingOnBitsrc ? describe : describe.skip)('using bitsrc', () => {
        let scopeName;
        let fullScopeName;
        const bitsrcTester = new BitsrcTester();
        before(() => {
          helper.getClonedLocalScope(localScope);
          return bitsrcTester
            .loginToBitSrc()
            .then(() => bitsrcTester.createScope())
            .then((scope) => {
              scopeName = scope;
              fullScopeName = `${username}.${scopeName}`;
            });
        });
        after(() => {
          return bitsrcTester.deleteScope(scopeName);
        });
        describe('exporting to bitsrc and importing locally', () => {
          before(() => {
            helper.tagAllComponents();
            helper.exportAllComponents(fullScopeName);
            helper.reInitLocalScope();
            helper.addRemoteScope();
            helper.runCmd(`bit import ${fullScopeName}/utils/is-string`);
          });
          it('should be able to require its direct dependency and print results from all dependencies', () => {
            // this makes sure that when generating npm links with custom-resolved-modules
            // and there are dist files, it doesn't generate an un-compiled .ts file, but a .js file
            const appJsFixture =
              "const isString = require('./components/utils/is-string'); console.log(isString.default());";
            fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
            const result = helper.runCmd('node app.js');
            expect(result.trim()).to.equal('got is-type and got is-string');
          });
        });
      });
    });
    describe('using aliases', () => {
      let scopeAfterAdding;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.getClonedLocalScope(scopeWithTypescriptCompiler);
        helper.addRemoteScope();
        const bitJson = helper.readBitJson();
        bitJson.resolveModules = { aliases: { '@': 'src' } };
        helper.writeBitJson(bitJson);

        const isTypeFixture = "export default function isType() { return 'got is-type'; };";
        helper.createFile('src/utils', 'is-type.ts', isTypeFixture);
        helper.addComponent('src/utils/is-type.ts', { i: 'utils/is-type' });
        const isStringFixture =
          "import isType from '@/utils/is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
        helper.createFile('src/utils', 'is-string.ts', isStringFixture);
        helper.addComponent('src/utils/is-string.ts', { i: 'utils/is-string' });
        const fooBarFixture =
          "import isString from '@/utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
        helper.createFile('src/bar', 'foo.ts', fooBarFixture);
        helper.addComponent('src/bar/foo.ts', { i: 'bar/foo' });
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
        expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.ts');
        expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.ts');
        expect(dependency.relativePaths[0].importSource).to.equal('@/utils/is-string');
        expect(dependency.relativePaths[0].isCustomResolveUsed).to.be.true;
      });
      describe('importing the component', () => {
        before(() => {
          helper.tagAllComponents();
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should generate the custom-resolve links correctly and be able to require the components', () => {
          const appJsFixture = `const barFoo = require('@bit/${
            helper.remoteScope
          }.bar.foo'); console.log(barFoo.default());`;
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got is-type and got is-string and got foo');
        });
      });
      describe('using bundler compiler that generates a dist file with a different name than the source', () => {
        before(() => {
          helper.getClonedLocalScope(scopeAfterAdding);
          helper.importDummyCompiler('bundle');
          helper.tagAllComponents();
          helper.reInitRemoteScope();
          helper.exportAllComponents();
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should generate the link inside node_modules with .js extension and not .ts', () => {
          const expectedFile = path.join(
            helper.localScopePath,
            'components/bar/foo/node_modules/@/utils/is-string/index.js'
          );
          expect(expectedFile).to.be.a.file();
          const notExpectedFile = path.join(
            helper.localScopePath,
            'components/bar/foo/node_modules/@/utils/is-string/index.ts'
          );
          expect(notExpectedFile).not.to.be.a.path();
        });
      });
    });
  });
  describe('when dist is outside the components dir', () => {
    let npmCiRegistry;
    before(() => {
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.setNewLocalAndRemoteScopes();
      helper.getClonedLocalScope(scopeWithTypescriptCompiler);
      npmCiRegistry.setCiScopeInBitJson();
      helper.addRemoteScope();
      helper.createFile('utils', 'is-type.ts', fixtures.isTypeTS);
      helper.addComponent('utils/is-type.ts', { i: 'utils/is-type' });
      helper.createFile('utils', 'is-string.ts', fixtures.isStringTS);
      helper.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
      helper.createFile('bar', 'foo.ts', fixtures.barFooTS);
      helper.addComponent('bar/foo.ts', { i: 'bar/foo' });
      helper.tagAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
      helper.importComponent('bar/foo');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = `const barFoo = require('@bit/${
        helper.remoteScope
      }.bar.foo'); console.log(barFoo.default());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    (supportNpmCiRegistryTesting ? describe : describe.skip)('when dependencies are saved as packages', () => {
      before(async () => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
        await npmCiRegistry.init();
        helper.importNpmPackExtension();
        helper.removeRemoteScope();
        npmCiRegistry.publishComponent('utils/is-type');
        npmCiRegistry.publishComponent('utils/is-string');
        npmCiRegistry.publishComponent('bar/foo');
      });
      after(() => {
        npmCiRegistry.destroy();
      });
      function runAppJs() {
        const appJsFixture = `const barFoo = require('@ci/${
          helper.remoteScope
        }.bar.foo'); console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo');
      }
      describe('installing a component using NPM', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.runCmd('npm init -y');
          helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          runAppJs();
        });
      });
      describe('importing a component using Bit', () => {
        before(() => {
          helper.reInitLocalScope();
          npmCiRegistry.setCiScopeInBitJson();
          npmCiRegistry.setResolver();
          helper.modifyFieldInBitJson('dist', { target: 'dist', entry: 'src' });
          helper.importComponent('bar/foo');
        });
        it('package.json of the dist should point to the dist file with .js extension (not .ts)', () => {
          const packageJson = helper.readPackageJson(path.join(helper.localScopePath, 'dist/components/bar/foo'));
          expect(packageJson.main).to.equal('bar/foo.js');
        });
        it('should be able to require its direct dependency and print results from all dependencies', () => {
          runAppJs();
        });
        describe('ejecting the component', () => {
          before(() => {
            helper.ejectComponents('bar/foo');
          });
          it('should delete also the dist directory', () => {
            expect(path.join(helper.localScopePath, 'dist/components/bar')).to.not.be.a.path();
          });
        });
      });
    });
  });
  describe('requiring an internal file', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.getClonedLocalScope(scopeWithTypescriptCompiler);
      helper.addRemoteScope();
      helper.createFile('src/utils', 'is-type.ts', '');
      helper.createFile('src/utils', 'is-type-internal.ts', fixtures.isTypeTS);
      helper.addComponent('src/utils/is-type.ts src/utils/is-type-internal.ts', {
        i: 'utils/is-type',
        m: 'src/utils/is-type.ts'
      });

      const isStringFixture =
        "import isType from './is-type-internal'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createFile('src/utils', 'is-string.ts', '');
      helper.createFile('src/utils', 'is-string-internal.ts', isStringFixture);
      helper.addComponent('src/utils/is-string.ts src/utils/is-string-internal.ts', {
        i: 'utils/is-string',
        m: 'src/utils/is-string.ts'
      });

      const barFooFixture =
        "import isString from '../utils/is-string-internal'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/bar', 'foo.ts', barFooFixture);
      helper.addComponent('src/bar/foo.ts', { i: 'bar/foo', m: 'src/bar/foo.ts' });
      helper.tagAllComponents();

      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    it('should be able to require the main and the internal files and print the results', () => {
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), fixtures.appPrintBarFooES6);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
});
