import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import { statusFailureMsg } from '../../src/cli/commands/public-cmds/status-cmd';

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
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
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
      expect(output).to.have.string('bar/foo ... ok');
      expect(output).to.not.have.string(statusFailureMsg);
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
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils/is-string', 'is-string.js', isStringFixture);
      helper.createFile('utils/is-string', 'index.js', "export { default as isString } from './is-string';");
      helper.createFile('utils', 'index.js', "export { default as isString } from './is-string';");
      helper.addComponent('utils/is-string/is-string.js', { i: 'is-string/is-string' });
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
    });
    it('should not consider both index files as a dependencies', () => {
      output = helper.runCmd('bit status');
      expect(output).to.have.string('bar/foo ... ok');
      expect(output).to.not.have.string(statusFailureMsg);
    });
    describe('when importing the component', () => {
      before(() => {
        helper.importCompiler();
        helper.tagAllWithoutMessage();
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
  });

  // the recent babel compiler includes the 'add-module-exports' plugin which previously
  // broke the link-files.
  describe('multiple link files, different "default" import situation and recent babel compiler', () => {
    let output;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils/is-string', 'is-string.js', isStringFixture);
      helper.createFile('utils/is-string', 'index.js', "import isString from './is-string'; export { isString }; ");
      helper.createFile('utils', 'index.js', "import { isString } from './is-string'; export { isString }; ");
      helper.addComponent('utils/is-string/is-string.js', { i: 'is-string/is-string' });
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
    });
    it('should not consider both index files as a dependencies', () => {
      output = helper.runCmd('bit status');
      expect(output).to.have.string('bar/foo ... ok');
      expect(output).to.not.have.string(statusFailureMsg);
    });
    describe('when importing the component', () => {
      before(() => {
        helper.importCompiler('bit.envs/compilers/babel');
        helper.tagAllWithoutMessage();
        helper.exportAllComponents();
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
      });
      it('should rewrite the relevant part of the link file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got foo');
      });
    });
  });

  describe('when a component uses link file to import multiple members', () => {
    let utilIndexFixture;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      utilIndexFixture =
        "import isArray from './is-array'; import isString from './is-string'; export { isArray, isString }; ";
      helper.createFile('utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    describe('when the project cloned to somewhere else as AUTHORED', () => {
      before(() => {
        helper.mimicGitCloneLocalProject(false);
        helper.addRemoteScope();
        helper.importAllComponents(true);
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
        helper.importComponent('bar/foo ');
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

  describe('when a component uses link file to import multiple members with custom-module-resolution import', () => {
    let utilIndexFixture;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: ['src'] };
      helper.writeBitJson(bitJson);

      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createFile('src/utils', 'is-array.js', isArrayFixture);
      helper.addComponent('src/utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.addComponent('src/utils/is-string.js', { i: 'utils/is-string' });
      utilIndexFixture =
        "import isArray from 'utils/is-array'; import isString from 'utils/is-string'; export { isArray, isString }; ";
      helper.createFile('src/utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from 'utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/bar', 'foo.js', fooBarFixture);
      helper.addComponent('src/bar/foo.js', { i: 'bar/foo' });

      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    describe('when importing the component', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo ');
      });
      it('should auto-generate a link file', () => {
        const currentUtilIndex = fs.readFileSync(
          path.join(helper.localScopePath, 'components/bar/foo/node_modules/utils/index.js')
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

  describe('when a component uses link file to import multiple members with export default as syntax', () => {
    let utilIndexFixture;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      utilIndexFixture =
        "export { default as isArray } from './is-array'; export { default as isString } from './is-string'; ";
      helper.createFile('utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    describe('when the project cloned to somewhere else as AUTHORED', () => {
      before(() => {
        helper.mimicGitCloneLocalProject(false);
        helper.addRemoteScope();
        helper.importAllComponents(true);
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
        helper.importComponent('bar/foo ');
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

  describe('when a component uses link file to import multiple members with export (without import) syntax', () => {
    let utilIndexFixture;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      utilIndexFixture = "export isArray from './is-array'; export isString from './is-string'; ";
      helper.createFile('utils', 'index.js', utilIndexFixture);
      const fooBarFixture =
        "import { isString } from '../utils'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    describe('when the project cloned to somewhere else as AUTHORED', () => {
      before(() => {
        helper.mimicGitCloneLocalProject(false);
        helper.addRemoteScope();
        helper.importAllComponents(true);
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
        helper.importComponent('bar/foo ');
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

  describe('when a component uses link file to import members AND that link file is part of the component', () => {
    let utilIndexFixture;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      utilIndexFixture =
        "export { default as isArray } from './is-array'; export { default as isString } from './is-string'; ";
      helper.createFile('utils', 'index.js', utilIndexFixture);
      // notice that in this case, the index.js file (link-file) is part of the component
      helper.addComponent('utils', { i: 'utils/misc' });
      const fooBarFixture =
        "import { isString, isArray } from '../utils'; export default function foo() { return isString() + ' and ' + isArray() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
    });
    describe('when importing the component', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.addRemoteScope();
        helper.importComponent('bar/foo');
      });
      it('should generate the links correctly as if there was no link-file', () => {
        const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-string and got is-array and got foo');
      });
    });
  });

  describe('when the link file uses default-import and specific-import together', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      const isBooleanFixture = "export default function isBoolean() { return 'got is-boolean'; };";
      helper.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
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
      helper.importComponent('bar/foo ');
    });
    it('should rewrite the relevant part of the link file', () => {
      const appJsFixture = "const barFoo = require('./components/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-array and got is-string and got foo');
    });
  });

  // skipped for now. tree shaking is not possible for ES5.
  describe.skip('when the link file uses default-import and specific-import together and using ES6 and ES5 together', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.importCompiler();
      const isArrayFixture = "export default function isArray() { return 'got is-array'; };";
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      const isBooleanFixture = "export default function isBoolean() { return 'got is-boolean'; };";
      helper.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
      const utilFixture = `import isArray from './is-array';
import isString from './is-string';
import isBoolean from './is-boolean';
export default isArray;
export { isString, isBoolean }; `;
      helper.createFile('utils', 'index.js', utilFixture);
      const fooBarFixture = `import isArray from '../utils';
const isString = require('../utils').isString;
export default function foo() { return isArray() + ' and ' + isString() + ' and got foo'; };`;
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();

      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo ');
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
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      const isBooleanFixture = `export function isBoolean() { return 'got is-boolean'; };
export function isBoolean2() { return 'got is-boolean2'; };`;
      helper.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
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
      helper.importComponent('bar/foo ');
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
      helper.createFile('utils', 'is-array.js', isArrayFixture);
      helper.addComponent('utils/is-array.js', { i: 'utils/is-array' });
      const isStringFixture = "export default function isString() { return 'got is-string'; };";
      helper.createFile('utils', 'is-string.js', isStringFixture);
      helper.addComponentUtilsIsString();
      const isBooleanFixture = `export function isBoolean() { return 'got is-boolean'; };
export function isBoolean2() { return 'got is-boolean2'; };
export default function isBooleanDefault() { return 'got is-boolean-default'; }; `;
      helper.createFile('utils', 'is-boolean.js', isBooleanFixture);
      helper.addComponent('utils/is-boolean.js', { i: 'utils/is-boolean' });
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
      helper.importComponent('bar/foo ');
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
