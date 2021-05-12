import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import { IssuesClasses } from '@teambit/component-issues';
import { IS_WINDOWS } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('typescript components with link files', function () {
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
   * utils/index.ts  => UNTRACKED FILE
   * bar/foo.ts      => component bar/foo
   *
   * The file "utils/index.ts" in untracked in any of the components, yet, because this file is
   * a link-file, which only links to is-string file, we expect bar/foo to ignore this file and not
   * raise a warning about missing-dependencies
   */
  describe('when a component uses index file to import single members from a module', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.ts', isArrayFixture);
      helper.command.addComponent('utils/is-array.ts', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.ts', isStringFixture);
      helper.command.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
      const utilFixture =
        "import isArray from './is-array'; import isString from './is-string'; export { isArray, isString }; ";
      helper.fs.createFile('utils', 'index.ts', utilFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('bar', 'foo.ts', fooBarFixture);
      helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });
    });
    it('should not consider that index file as a dependency', () => {
      const allIssues = helper.command.getAllIssuesFromStatus();
      expect(allIssues).to.not.include(IssuesClasses.UntrackedDependencies.name);
    });
  });

  describe('when importing a component that uses link file', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.env.importTypescriptCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.fs.createFile('utils', 'is-array.ts', isArrayFixture);
      helper.command.addComponent('utils/is-array.ts', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.fs.createFile('utils', 'is-string.ts', isStringFixture);
      helper.command.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
      const utilFixture =
        "import isArray from './is-array'; import isString from './is-string'; export { isArray, isString }; ";
      helper.fs.createFile('utils', 'index.ts', utilFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.fs.createFile('bar', 'foo.ts', fooBarFixture);
      helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });

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

  describe('when the link file uses default-import and specific-import together', () => {
    if (IS_WINDOWS || process.env.APPVEYOR === 'True') {
      // fails on AppVeyor for unknown reason ("spawnSync C:\Windows\system32\cmd.exe ENOENT").
      // @ts-ignore
      this.skip;
    } else {
      before(() => {
        helper.scopeHelper.setNewLocalAndRemoteScopes();
        helper.env.importTypescriptCompiler();
        const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
        helper.fs.createFile('utils', 'is-array.ts', isArrayFixture);
        helper.command.addComponent('utils/is-array.ts', { i: 'utils/is-array' });
        const isStringFixture = "export default function isString() { return 'got is-string'; };";
        helper.fs.createFile('utils', 'is-string.ts', isStringFixture);
        helper.command.addComponent('utils/is-string.ts', { i: 'utils/is-string' });
        const isBooleanFixture = `export function isBoolean() { return 'got is-boolean'; };
  export function isBoolean2() { return 'got is-boolean2'; };`;
        helper.fs.createFile('utils', 'is-boolean.ts', isBooleanFixture);
        helper.command.addComponent('utils/is-boolean.ts', { i: 'utils/is-boolean' });
        const utilFixture = `import isArray from './is-array';
  import isString from './is-string';
  import { isBoolean, isBoolean2 } from './is-boolean';
  export default isArray;
  export { isString, isBoolean, isBoolean2 }; `;
        helper.fs.createFile('utils', 'index.ts', utilFixture);
        const fooBarFixture = `import isArray, { isString, isBoolean, isBoolean2 } from '../utils';
  export default function foo() { return isArray() + ' and ' + isString() + ' and ' + isBoolean() + ' and ' + isBoolean2() + ' and got foo'; };`;
        helper.fs.createFile('bar', 'foo.ts', fooBarFixture);
        helper.command.addComponent('bar/foo.ts', { i: 'bar/foo' });

        helper.command.tagAllComponents();
        helper.command.exportAllComponents();
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('bar/foo');
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = `const barFoo = require('./components/bar/foo');
  console.log(barFoo.default());`;
        fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
        const result = helper.command.runCmd('node app.js');
        expect(result.trim()).to.equal(
          'got is-array and got is-string and got is-boolean and got is-boolean2 and got foo'
        );
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
});
