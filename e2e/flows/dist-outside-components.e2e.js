import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';

describe('dists file are written outside the components dir', function () {
  this.timeout(0);
  const helper = new Helper();
  let scopeWithCompiler;
  before(() => {
    helper.setNewLocalAndRemoteScopes();
    helper.importCompiler();
    scopeWithCompiler = helper.cloneLocalScope();
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('when using absolute import', () => {
    /**
     * bar/foo depends on utils/is-string.
     * utils/is-string depends on utils/is-type
     *
     * Expected structure after importing bar/foo in another project
     ./components/bar/foo/index.js
     ./components/bar/foo/package.json
     ./components/bar/foo/foo.js
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/bit.json
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/index.js
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/utils/is-type.js
     ./components/.dependencies/utils/is-type/remote-scope/0.0.1/package.json
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/bit.json
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/index.js
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string.js
     ./components/.dependencies/utils/is-string/remote-scope/0.0.1/package.json
     ./dist/components/bar/foo/index.js
     ./dist/components/bar/foo/foo.js
     ./dist/components/bar/foo/foo.js.map
     ./dist/components/.dependencies/utils/is-type/remote-scope/0.0.1/index.js
     ./dist/components/.dependencies/utils/is-type/remote-scope/0.0.1/utils/is-type.js.map
     ./dist/components/.dependencies/utils/is-type/remote-scope/0.0.1/utils/is-type.js
     ./dist/components/.dependencies/utils/is-string/remote-scope/0.0.1/index.js
     ./dist/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string.js.map
     ./dist/components/.dependencies/utils/is-string/remote-scope/0.0.1/utils/is-string.js
     */
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      helper.commitAllComponents();
      helper.exportAllComponents();

      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-type --dist');

      const isStringFixture =
        "import isType from 'bit/utils/is-type'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.getClonedLocalScope(scopeWithCompiler);
      helper.importComponent('utils/is-string --dist');

      const fooBarFixture =
        "import isString from 'bit/utils/is-string'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo --dist');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('bit/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
    describe('after updating the imported component', () => {
      before(() => {
        const fooBarFixtureV2 =
          "import isString from 'bit/utils/is-string'; export default function foo() { return isString() + ' and got foo v2'; };";
        helper.createComponent('components/bar/foo', 'foo.js', fooBarFixtureV2); // update component
        helper.addRemoteEnvironment();
        helper.build();
      });
      it('should be able to require its direct dependency and print results from all dependencies', () => {
        const appJsFixture = "const barFoo = require('bit/bar/foo'); console.log(barFoo.default());";
        fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
        const result = helper.runCmd('node app.js');
        expect(result.trim()).to.equal('got is-type and got is-string and got foo v2');
      });
    });
  });
  /**
   * Directory structure of the author
   * bar/foo.js
   * utils/is-string.js
   * utils/is-type.js
   *
   * bar/foo depends on utils/is-string.
   * utils/is-string depends on utils/is-type
   */
  describe('when using relative import', () => {
    before(() => {
      helper.getClonedLocalScope(scopeWithCompiler);
      const isTypeFixture = "export default function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "import isType from './is-type.js'; export default function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      const fooBarFixture =
        "import isString from '../utils/is-string.js'; export default function foo() { return isString() + ' and got foo'; };";
      helper.createComponentBarFoo(fooBarFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.modifyFieldInBitJson('dist', { target: 'dist' });
      helper.importComponent('bar/foo --dist');
    });
    it('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = "const barFoo = require('bit/bar/foo'); console.log(barFoo.default());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
});
