// covers init, tag, create, import commands and

import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import normalize from 'normalize-path';
import Helper from '../e2e-helper';
import BitsrcTester, { username, supportTestingOnBitsrc } from '../bitsrc-tester';

const helper = new Helper();

// todo: once the bind is implemented, make it work
describe('typescript', function () {
  this.timeout(0);
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
        helper.importCompiler('bit.envs/compilers/react-typescript');
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
      it('should create an index.js file on the is-string dependency root dir pointing to the main file', () => {
        const expectedLocation = path.join(isStringPath, 'index.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const indexPath = path.join(helper.localScopePath, expectedLocation);
        const indexFileContent = fs.readFileSync(indexPath).toString();
        expect(indexFileContent).to.have.string(
          "module.exports = require('./dist/utils/is-string');",
          'dependency index file point to the wrong place'
        );
      });
      it('should point the main file key in the is-string dependency package.json to the dist main file', () => {
        const packageJsonFolder = path.join(helper.localScopePath, isStringPath);
        const packageJsonContent = helper.readPackageJson(packageJsonFolder);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.utils.is-string`,
          version: '0.0.1',
          main: 'dist/utils/is-string.js'
        });
      });
      it('should create an index.js file on the is-type dependency root dir pointing to the main file', () => {
        const expectedLocation = path.join(isTypePath, 'index.js');
        expect(localConsumerFiles).to.include(expectedLocation);
        const indexPath = path.join(helper.localScopePath, expectedLocation);
        const indexFileContent = fs.readFileSync(indexPath).toString();
        expect(indexFileContent).to.have.string(
          "module.exports = require('./dist/utils/is-type');",
          'dependency index file point to the wrong place'
        );
      });
      it('should point the main file key in the is-type dependency package.json to the dist main file', () => {
        const packageJsonFolder = path.join(helper.localScopePath, isTypePath);
        const packageJsonContent = helper.readPackageJson(packageJsonFolder);
        expect(packageJsonContent).to.deep.include({
          name: `@bit/${helper.remoteScope}.utils.is-type`,
          version: '0.0.1',
          main: 'dist/utils/is-type.js'
        });
      });
      it('should save the direct dependency nested to the main component', () => {
        const expectedLocation = path.join(isStringPath, 'utils', 'is-string.ts');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should save the indirect dependency nested to the main component (as opposed to nested of nested)', () => {
        const expectedLocation = path.join(isTypePath, 'utils', 'is-type.ts');
        expect(localConsumerFiles).to.include(expectedLocation);
      });
      it('should add dependencies dists files to file system', () => {
        const expectedIsTypeDistLocation = path.join(isTypePath, 'dist', 'utils', 'is-type.js');
        const expectedIsStringDistLocation = path.join(isStringPath, 'dist', 'utils', 'is-string.js');
        expect(localConsumerFiles).to.include(expectedIsTypeDistLocation);
        expect(localConsumerFiles).to.include(expectedIsStringDistLocation);
      });
      it('should link the direct dependency to its source file from main component source folder', () => {
        const expectedLocation = path.join('components', 'bar', 'foo', 'utils', 'is-string.ts');
        const linkPath = path.join(helper.localScopePath, expectedLocation);
        const linkPathContent = fs.readFileSync(linkPath).toString();
        const expectedPathSuffix = normalize(
          path.join('.dependencies', 'utils', 'is-string', helper.remoteScope, '0.0.1', 'utils', 'is-string')
        );
        expect(localConsumerFiles).to.include(expectedLocation);
        expect(linkPathContent).to.have.string(
          `../../../${expectedPathSuffix}`,
          'dependency link file point to the wrong place'
        );
      });
      it('should link the direct dependency to its index file from main component dist folder', () => {
        const expectedLocation = path.join('components', 'bar', 'foo', 'dist', 'utils', 'is-string.js');
        const linkPath = path.join(helper.localScopePath, expectedLocation);
        const linkPathContent = fs.readFileSync(linkPath).toString();
        const expectedPathSuffix = normalize(
          path.join('.dependencies', 'utils', 'is-string', helper.remoteScope, '0.0.1')
        );
        expect(localConsumerFiles).to.include(expectedLocation);
        expect(linkPathContent).to.have.string(
          `../../../../${expectedPathSuffix}`,
          'dependency link file point to the wrong place'
        );
      });
      it('should link the indirect dependency from dependent component source folder to its source file in the dependency directory', () => {
        const expectedLocation = path.join(isStringPath, 'utils', 'is-type.ts');
        const linkPath = path.join(helper.localScopePath, expectedLocation);
        const linkPathContent = fs.readFileSync(linkPath).toString();
        const expectedPathSuffix = normalize(path.join('is-type', helper.remoteScope, '0.0.1', 'utils', 'is-type'));
        expect(localConsumerFiles).to.include(expectedLocation);
        expect(linkPathContent).to.have.string(
          `../../../../${expectedPathSuffix}`,
          'in direct dependency link file point to the wrong place'
        );
      });
      it('should link the indirect dependency from dependent component dist folder to its index file in the dependency directory', () => {
        const expectedLocation = path.join(isStringPath, 'dist', 'utils', 'is-type.js');
        const linkPath = path.join(helper.localScopePath, expectedLocation);
        const linkPathContent = fs.readFileSync(linkPath).toString();
        const expectedPathSuffix = normalize(path.join('is-type', helper.remoteScope, '0.0.1'));
        expect(localConsumerFiles).to.include(expectedLocation);
        expect(linkPathContent).to.have.string(
          `../../../../../${expectedPathSuffix}`,
          'in direct dependency link file point to the wrong place'
        );
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
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler('bit.envs/compilers/react-typescript');
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
      const compilerPrefix = path.join(
        helper.localScopePath,
        '.bit',
        'components',
        'compilers',
        'react-typescript',
        'bit.envs'
      );
      let version = '';
      fs.readdirSync(compilerPrefix).forEach((file) => {
        version = file;
      });
      const compilerPath = path.join(compilerPrefix, version, 'node_modules', 'typescript', 'bin');
      const result = helper.runCmd(`tsc ${barFooFile}`, compilerPath);
      // in case of compilation error it throws an exception
      expect(result.trim()).to.equal('');
    });
  });
  describe('with custom module resolution', () => {
    describe('using module directories', () => {
      let localScope;
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.importCompiler('bit.envs/compilers/react-typescript');
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
          helper.destroyEnv();
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
      before(() => {
        helper.reInitLocalScope();
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
    });
  });
});
