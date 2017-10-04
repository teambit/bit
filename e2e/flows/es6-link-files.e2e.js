import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';

describe('es6 components with link files', function () {
  if (process.env.APPVEYOR === 'True') {
    this.skip; // @todo: make it work for Windows
  } else {
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

    describe('when importing a component that uses link file', () => {
      before(() => {
        helper.setNewLocalAndRemoteScopes();
        helper.importCompiler();
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
        expect(result.trim()).to.equal('got is-string and got foo');
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
  }
});
