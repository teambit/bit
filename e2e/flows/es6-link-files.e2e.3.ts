import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import Helper from '../../src/e2e-helper/e2e-helper';
import NpmCiRegistry, { supportNpmCiRegistryTesting } from '../npm-ci-registry';

describe('es6 components with link files', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });

  /**
   * utils/is-array  => component utils/is-array
   * utils/is-string => component utils/is-string
   * utils/index.js  => UNTRACKED FILE
   * bar/foo.js      => component bar/foo
   *
   * The file "utils/index.js" in untracked in any of the components, yet, because this file is
   * a link-file, which only links to is-string file, we expect bar/foo to ignore this file and not
   * raise a warning about missing-dependencies
   */
  describe('when a component uses index file to import single members from a module', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      const utilFixture =
        "import isArray from './is-array'; import isString from './is-string'; export { isArray, isString }; ";
      helper.fs.createFile('utils', 'index.js', utilFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();
    });
    it('should not consider that index file as a dependency', () => {
      const allIssues = helper.command.getAllIssuesFromStatus();
      expect(allIssues).to.not.include(IssuesClasses.UntrackedDependencies.name);
    });
  });

  // the bar/foo.js requires an index file => utils/index.js,
  // which requires another index file: utils/is-string/index.js,
  // which requires a real file utils/is-string/is-string.js
  // bit-javascript does the heavy lifting and provides with a final 'linkFile',
  // which will be possible to conclude the sourceRelativePath: "utils/index.js"
  // and the destinationRelativePath: "utils/is-string/is-string.js", all the rest index files are irrelevant.
  // in this case, the utils/is-string/index.js is not important and can be ignored altogether.
  describe('multiple link files', () => {
    let npmCiRegistry: NpmCiRegistry;
    before(() => {
      npmCiRegistry = new NpmCiRegistry(helper);
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      npmCiRegistry.setCiScopeInBitJson();
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils/is-string', 'is-string.js', isStringFixture);
      helper.fs.createFile('utils/is-string', 'index.js', "export { default as isString } from './is-string';");
      helper.fs.createFile(
        'utils',
        'index.js',
        `import { isString } from './is-string';
export { isString };`
      );
      helper.command.addComponent('utils/is-string/is-string.js', { i: 'is-string/is-string' });
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();
    });
    it('should not consider both index files as a dependencies', () => {
      const allIssues = helper.command.getAllIssuesFromStatus();
      expect(allIssues).to.not.include(IssuesClasses.UntrackedDependencies.name);
    });
    it('bit link --rewire should not change the source code', () => {
      // that's because this link file and the main file don't have the same "import default" settings
      // so changing the source-code result in an invalid import statement
      const rewire = helper.command.linkAndRewire();
      expect(rewire).to.have.string('rewired 0 components');
    });
    describe('when importing the component', () => {
      before(() => {
        helper.env.importCompiler();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        npmCiRegistry.setCiScopeInBitJson();
        helper.command.importComponent('bar/foo');
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
      (supportNpmCiRegistryTesting ? describe : describe.skip)(
        'installing dependencies as packages (not as components)',
        () => {
          before(async () => {
            await npmCiRegistry.init();
            helper.command.importComponent('is-string/is-string');
            helper.scopeHelper.removeRemoteScope();
            npmCiRegistry.publishComponent('is-string/is-string');
            npmCiRegistry.publishComponent('bar/foo');
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
            it('should be able to create the dependency link correctly and print the result', () => {
              const appJsFixture = `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`;
              fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
              const result = helper.command.runCmd('node app.js');
              expect(result.trim()).to.equal('got is-string and got foo');
            });
          });
          describe('importing a component using Bit', () => {
            before(() => {
              helper.scopeHelper.reInitLocalScope();
              npmCiRegistry.setCiScopeInBitJson();
              npmCiRegistry.setResolver();
              helper.command.importComponent('bar/foo');
            });
            it('should be able to create the dependency link correctly and print the result', () => {
              const appJsFixture = `const barFoo = require('@ci/${helper.scopes.remote}.bar.foo'); console.log(barFoo.default());`;
              fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
              const result = helper.command.runCmd('node app.js');
              expect(result.trim()).to.equal('got is-string and got foo');
            });
          });
        }
      );
    });
  });

  // the recent babel compiler includes the 'add-module-exports' plugin which previously
  // broke the link-files.
  describe('multiple link files, different "default" import situation and recent babel compiler', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils/is-string', 'is-string.js', isStringFixture);
      helper.fs.createFile('utils/is-string', 'index.js', "import isString from './is-string'; export { isString }; ");
      helper.fs.createFile('utils', 'index.js', "import { isString } from './is-string'; export { isString }; ");
      helper.command.addComponent('utils/is-string/is-string.js', { i: 'is-string/is-string' });
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();
    });
    it('should not consider both index files as a dependencies', () => {
      const allIssues = helper.command.getAllIssuesFromStatus();
      expect(allIssues).to.not.include(IssuesClasses.UntrackedDependencies.name);
    });
    describe('when importing the component', () => {
      before(() => {
        helper.env.importCompiler();
        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
    });
  });

  describe('when a component uses link file to import multiple members', () => {
    let utilIndexFixture;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      utilIndexFixture =
        "import isArray from './is-array'; import isString from './is-string'; export { isArray, isString }; ";
      helper.fs.createFile('utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    describe('when the project cloned to somewhere else as AUTHORED', () => {
      before(() => {
        helper.git.mimicGitCloneLocalProject(false);
        helper.scopeHelper.addRemoteScope();
        helper.command.importAllComponents(true);
      });
      it('should not override the original link file', () => {
        const currentUtilIndex = fs.readFileSync(path.join(helper.scopes.localPath, 'utils', 'index.js'));
        expect(currentUtilIndex.toString()).to.equal(utilIndexFixture);
      });
    });
    describe('when importing the component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo ');
      });
      it('should auto-generate a link file', () => {
        const currentUtilIndex = fs.readFileSync(
          path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'utils', 'index.js')
        );
        expect(currentUtilIndex.toString()).to.not.equal(utilIndexFixture);
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
    });
  });

  describe('when a component uses link file to import multiple members with custom-module-resolution import', () => {
    let utilIndexFixture;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const bitJson = helper.bitJson.read();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.bitJson.write(bitJson);

      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('src/utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('src/utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.command.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      utilIndexFixture =
        "import isArray from 'utils/is-array'; import isString from 'utils/is-string'; export { isArray, isString }; ";
      helper.fs.createFile('src/utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from 'utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('src/bar', 'foo.js', fooBarFixture);
      helper.command.addComponent('src/bar/foo.js', { i: 'bar/foo' });

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    describe('when importing the component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo ');
      });
      it('should auto-generate a link file', () => {
        const currentUtilIndex = fs.readFileSync(
          path.join(helper.scopes.localPath, 'components/bar/foo/node_modules/utils/index.js')
        );
        expect(currentUtilIndex.toString()).to.not.equal(utilIndexFixture);
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
    });
  });

  describe('when a component uses link file to import multiple members with export default as syntax', () => {
    let utilIndexFixture;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      utilIndexFixture =
        "export { default as isArray } from './is-array'; export { default as isString } from './is-string'; ";
      helper.fs.createFile('utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    describe('when the project cloned to somewhere else as AUTHORED', () => {
      before(() => {
        helper.git.mimicGitCloneLocalProject(false);
        helper.scopeHelper.addRemoteScope();
        helper.command.importAllComponents(true);
      });
      it('should not override the original link file', () => {
        const currentUtilIndex = fs.readFileSync(path.join(helper.scopes.localPath, 'utils', 'index.js'));
        expect(currentUtilIndex.toString()).to.equal(utilIndexFixture);
      });
    });
    describe('when importing the component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo ');
      });
      it('should auto-generate a link file', () => {
        const currentUtilIndex = fs.readFileSync(
          path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'utils', 'index.js')
        );
        expect(currentUtilIndex.toString()).to.not.equal(utilIndexFixture);
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
    });
  });

  describe('when a component uses link file to import multiple members with export (without import) syntax', () => {
    let utilIndexFixture;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      utilIndexFixture = "export isArray from './is-array'; export isString from './is-string'; ";
      helper.fs.createFile('utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    describe('when the project cloned to somewhere else as AUTHORED', () => {
      before(() => {
        helper.git.mimicGitCloneLocalProject(false);
        helper.scopeHelper.addRemoteScope();
        helper.command.importAllComponents(true);
      });
      it('should not override the original link file', () => {
        const currentUtilIndex = fs.readFileSync(path.join(helper.scopes.localPath, 'utils', 'index.js'));
        expect(currentUtilIndex.toString()).to.equal(utilIndexFixture);
      });
    });
    describe('when importing the component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo ');
      });
      it('should auto-generate a link file', () => {
        const currentUtilIndex = fs.readFileSync(
          path.join(helper.scopes.localPath, 'components', 'bar', 'foo', 'utils', 'index.js')
        );
        expect(currentUtilIndex.toString()).to.not.equal(utilIndexFixture);
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
    });
  });

  describe('when a component uses link file to import members AND that link file is part of the component', () => {
    let utilIndexFixture;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      utilIndexFixture =
        "export { default as isArray } from './is-array'; export { default as isString } from './is-string'; ";
      helper.fs.createFile('utils', 'index.js', utilIndexFixture);
      // notice that in this case, the index.js file (link-file) is part of the component
      helper.command.addComponent('utils', { i: 'utils/misc' });
      const fooBarFixture =
        "import { isString, isArray } from '../utils'; export default function foo() { return isString() + ' and ' + isArray() + ' and got foo'; };";
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    describe('when importing the component', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should generate the links correctly as if there was no link-file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got is-array and got foo');
      });
    });
  });

  describe('when the link file uses default-import and specific-import together', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      const isBooleanFixture = "export default function isBoolean() { return 'got is-boolean'; };";
      helper.fs.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.command.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
      const utilFixture = `import isArray from './is-array';
import isString from './is-string';
import isBoolean from './is-boolean';
export default isArray;
export { isString, isBoolean }; `;
      helper.fs.createFile('utils', 'index.js', utilFixture);
      const fooBarFixture = `import isArray, { isString } from '../utils';
export default function foo() { return isArray() + ' and ' + isString() + ' and got foo'; };`;
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo ');
    });
    it('should rewrite the relevant part of the link file', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-array and got is-string and got foo');
    });
  });

  // skipped for now. tree shaking is not possible for ES5.
  describe.skip('when the link file uses default-import and specific-import together and using ES6 and ES5 together', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      const isBooleanFixture = "export default function isBoolean() { return 'got is-boolean'; };";
      helper.fs.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.command.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
      const utilFixture = `import isArray from './is-array';
import isString from './is-string';
import isBoolean from './is-boolean';
export default isArray;
export { isString, isBoolean }; `;
      helper.fs.createFile('utils', 'index.js', utilFixture);
      const fooBarFixture = `import isArray from '../utils';
const isString = require('../utils').isString;
export default function foo() { return isArray() + ' and ' + isString() + ' and got foo'; };`;
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo ');
    });
    it('should rewrite the relevant part of the link file', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-array and got is-string and got foo');
    });
  });

  describe('when a component uses non-link files with default-import and specific-import together', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      const isBooleanFixture = `export function isBoolean() { return 'got is-boolean'; };
export function isBoolean2() { return 'got is-boolean2'; };`;
      helper.fs.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.command.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
      const fooBarFixture = `import isArray from '../utils/is-array';
import isString from '../utils/is-string';
import { isBoolean, isBoolean2 } from '../utils/is-boolean';
export default function foo() { return isArray() + ' and ' + isString() + ' and ' + isBoolean() + ' and ' + isBoolean2() + ' and got foo'; };`;
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo ');
    });
    it('should generate the links correctly', () => {
      const appJsFixture = `const barFoo = require('./components/bar/foo');
console.log(barFoo.default());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal(
        'got is-array and got is-string and got is-boolean and got is-boolean2 and got foo'
      );
    });
  });

  describe('when a component uses a link and non-link files with default-import and specific-import together', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.js', isArrayFixture);
      helper.command.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.fixtures.addComponentUtilsIsString();
      const isBooleanFixture = `export function isBoolean() { return 'got is-boolean'; };
export function isBoolean2() { return 'got is-boolean2'; };
export default function isBooleanDefault() { return 'got is-boolean-default'; }; `;
      helper.fs.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.command.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
      const utilFixture = `import isArray from './is-array';
import isString from './is-string';
export default isArray;
export { isString }; `;
      helper.fs.createFile('utils', 'index.js', utilFixture);

      const fooBarFixture = `import isArray from '../utils';
import { isString } from '../utils';
import isBooleanDefault, { isBoolean, isBoolean2 } from '../utils/is-boolean';
export default function foo() { return isArray() + ' and ' + isString() + ' and ' + isBoolean() + ' and ' + isBoolean2() + ' and ' + isBooleanDefault() + ' and got foo'; };`;
      helper.fixtures.createComponentBarFoo(fooBarFixture);
      helper.fixtures.addComponentBarFoo();

      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('bar/foo ');
    });
    it('should generate the links correctly', () => {
      const appJsFixture = `const barFoo = require('./components/bar/foo');
console.log(barFoo.default());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal(
        'got is-array and got is-string and got is-boolean and got is-boolean2 and got is-boolean-default and got foo'
      );
    });
  });
});
