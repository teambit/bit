import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';

describe('es6 components with link files', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
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
    let output;
    before(() => {
      helper.reInitLocalScope();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createComponent('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js');
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const utilFixture =
        "import isArray from './is-array'; import isString from './is-string'; export { isArray, isString }; ";
      helper.createFile('utils', 'index.js', utilFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
    });
    it('should not consider that index file as a dependency', () => {
      output = helper.runCmd('bit status');
      expect(output.includes('bar/foo... ok')).to.be.true;
      expect(output.includes('missing dependencies')).to.be.false;
    });
  });

  describe('when a component uses link file to import multiple members', () => {
    let utilIndexFixture;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createComponent('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js');
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      utilIndexFixture =
        "import isArray from './is-array'; import isString from './is-string'; export { isArray, isString }; ";
      helper.createFile('utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.mimicGitCloneLocalProject();
    });
    describe('when the project cloned to somewhere else as AUTHORED', () => {
      before(() => {
        helper.mimicGitCloneLocalProject();
      });
      it('should not override the original link file', () => {
        const currentUtilIndex = fs.readFileSync(path.join(helper.localScopePath, 'utils', 'index.js'));
        expect(currentUtilIndex.toString()).to.equal(utilIndexFixture);
      });
    });
    describe('when importing the component', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
      });
      it('should auto-generate a link file', () => {
        const currentUtilIndex = fs.readFileSync(
          path.join(helper.localScopePath, 'components', 'bar', 'foo', 'utils', 'index.js')
        );
        expect(currentUtilIndex.toString()).to.not.equal(utilIndexFixture);
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
    });
  });

  describe('when the link file uses default-import and specific-import together', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createComponent('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js');
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const isBooleanFixture = "export default function isBoolean() { return 'got is-boolean'; };";
      helper.createComponent('utils', 'is-boolean.js', isBooleanFixture);
      helper.addComponent('utils/is-boolean.js');
      const utilFixture = `import isArray from './is-array';
import isString from './is-string';
import isBoolean from './is-boolean';
export default isArray;
export { isString, isBoolean }; `;
      helper.createFile('utils', 'index.js', utilFixture);
      const fooBarFixture = `import isArray, { isString } from '../utils';
export default function foo() { return isArray() + ' and ' + isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    it('should rewrite the relevant part of the link file', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-array and got is-string and got foo');
    });
  });

  describe('when a component uses non-link files with default-import and specific-import together', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createComponent('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js');
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const isBooleanFixture = `export function isBoolean() { return 'got is-boolean'; };
export function isBoolean2() { return 'got is-boolean2'; };`;
      helper.createComponent('utils', 'is-boolean.js', isBooleanFixture);
      helper.addComponent('utils/is-boolean.js');
      const fooBarFixture = `import isArray from '../utils/is-array';
import isString from '../utils/is-string';
import { isBoolean, isBoolean2 } from '../utils/is-boolean';
export default function foo() { return isArray() + ' and ' + isString() + ' and ' + isBoolean() + ' and ' + isBoolean2() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    it('should generate the links correctly', () => {
      const appJsFixture = `const barFoo = require('./components/bar/foo');
console.log(barFoo.default());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal(
        'got is-array and got is-string and got is-boolean and got is-boolean2 and got foo'
      );
    });
  });

  describe('when a component uses a link and non-link files with default-import and specific-import together', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createComponent('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js');
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const isBooleanFixture = `export function isBoolean() { return 'got is-boolean'; };
export function isBoolean2() { return 'got is-boolean2'; };
export default function isBooleanDefault() { return 'got is-boolean-default'; }; `;
      helper.createComponent('utils', 'is-boolean.js', isBooleanFixture);
      helper.addComponent('utils/is-boolean.js');
      const utilFixture = `import isArray from './is-array';
import isString from './is-string';
export default isArray;
export { isString }; `;
      helper.createFile('utils', 'index.js', utilFixture);

      const fooBarFixture = `import isArray from '../utils';
import { isString } from '../utils';
import isBooleanDefault, { isBoolean, isBoolean2 } from '../utils/is-boolean';
export default function foo() { return isArray() + ' and ' + isString() + ' and ' + isBoolean() + ' and ' + isBoolean2() + ' and ' + isBooleanDefault() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
    });
    it('should generate the links correctly', () => {
      const appJsFixture = `const barFoo = require('./components/bar/foo');
console.log(barFoo.default());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal(
        'got is-array and got is-string and got is-boolean and got is-boolean2 and got is-boolean-default and got foo'
      );
    });
  });
});
