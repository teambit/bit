// covers also init, tag, create, export, import, remote, build commands

import * as path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper, { VERSION_DELIMITER } from '../../src/e2e-helper/e2e-helper';

const helper = new Helper();
const fooComponentFixture = "module.exports = function foo() { return 'got foo'; };";
const fooES6Fixture = "import fs from 'fs'; module.exports = function foo() { return 'got foo'; };";
const fooImplPath = path.join(helper.scopes.localPath, 'inline_components', 'global', 'foo', 'impl.js');

function expectLinksInComponentLevel() {
  const appJs = "const foo = require('bit/global/foo'); console.log(foo());";
  fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
  const result = helper.command.runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

function expectLinksInNamespaceLevel() {
  const appJs = "const bitGlobal = require('bit/global'); console.log(bitGlobal.foo());";
  fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
  const result = helper.command.runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

function expectLinksInRootLevel() {
  const appJs = "const bit = require('bit'); console.log(bit.global.foo());";
  fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
  const result = helper.command.runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

function createFile(name, impl) {
  helper.command.runCmd(`bit create ${name} --json`);
  const componentFixture = impl || `module.exports = function ${name}() { return 'got ${name}'; };`;
  fs.outputFileSync(path.join(helper.scopes.localPath, 'components', 'global', name, 'impl.js'), componentFixture);
}

// todo: once the bind is implemented, make it work
describe('javascript-hooks', function() {
  this.timeout(0);
  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('import component with internals files', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.fs.createFile(path.join('utils', 'internals'), 'is-type.js', isTypeFixture);
      const isStringFixture =
        "const isType = require('./internals/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.fs.createFile('utils', 'is-string.js', isStringFixture);
      helper.command.addComponent('utils', { m: 'utils/is-string.js', i: 'utils/is-string' });
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScope();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('utils/is-string');
    });
    it('should be able to require the main file using require(bit/) syntax', () => {
      const appJsFixture = `const isString = require('${helper.general.getRequireBitPath(
        'utils',
        'is-string'
      )}'); console.log(isString());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
    it('should be able to require the internal file using require(bit/) syntax', () => {
      const appJsFixture = `const isType = require('@bit/${helper.scopes.remote}.utils.is-string/internals/is-type'); console.log(isType());`;
      fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJsFixture);
      const result = helper.command.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type');
    });
  });

  describe.skip('onCreate', () => {
    describe.skip('without build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        createFile('foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
    describe.skip('with build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.env.importCompiler();
        createFile('foo', fooES6Fixture);
        helper.command.runCmd('bit build foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
  });

  describe.skip('onCommit', () => {
    describe.skip('without build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        createFile('foo');
        helper.command.tagComponent('foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
    describe.skip('with build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.env.importCompiler();
        createFile('foo', fooES6Fixture);
        helper.command.tagComponent('foo'); // does the build as well
        // todo: tag should run the build
        helper.command.runCmd('bit build foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
  });

  describe.skip('onExport', () => {
    describe.skip('without build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        createFile('foo');
        helper.command.tagComponent('foo');
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportComponent('foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });

    describe.skip('with build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.env.importCompiler();
        createFile('foo', fooES6Fixture);
        helper.command.tagComponent('foo'); // does the build as well
        // todo: tag should run the build
        helper.command.runCmd('bit build foo');
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportComponent('foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
  });

  describe.skip('onImport', () => {
    describe.skip('without build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        createFile('foo');
        helper.command.tagComponent('foo');
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportComponent('foo');
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('global/foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
    describe.skip('with build', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.env.importCompiler();
        createFile('foo', fooES6Fixture);
        helper.command.tagComponent('foo');
        // todo: tag should run the build
        helper.command.runCmd('bit build foo');
        helper.scopeHelper.reInitRemoteScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.exportComponent('foo');

        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('global/foo');
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
    describe.skip('with test', () => {
      before(() => {
        helper.scopeHelper.clean();
        helper.scopeHelper.initWorkspace();
        helper.command.runCmd('bit import bit.envs/testers/mocha --tester');
        helper.command.runCmd('bit create foo --json --specs');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.command.runCmd('bit tag foo tag-msg'); // run the test as well
        helper.command.runCmd('bit init --bare', helper.scopes.remotePath);
        helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath}`);
        helper.command.runCmd(`bit export @this/global/foo @${helper.scopes.remote}`);
        fs.emptyDirSync(helper.scopes.localPath); // a new local scope
        helper.scopeHelper.initWorkspace();
        helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath}`);
        helper.command.runCmd(`bit import @${helper.scopes.remote}/global/foo`);
      });
      it('should create links in the component level', () => {
        expectLinksInComponentLevel();
      });
      it('should create links in the namespace level', () => {
        expectLinksInNamespaceLevel();
      });
      it('should create links in the root level', () => {
        expectLinksInRootLevel();
      });
    });
    describe.skip('with dependencies', () => {
      before(() => {
        helper.scopeHelper.clean();
        helper.scopeHelper.initWorkspace();
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        createFile('foo');
        helper.command.tagComponent('foo');
        helper.command.runCmd('bit init --bare', helper.scopes.remotePath);
        helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath}`);
        helper.command.exportComponent('foo');

        const barComponentFixture =
          "const foo = require('bit/global/foo'); module.exports = function bar() { return 'got bar and ' + foo(); };";
        createFile('bar', barComponentFixture);

        const barJsonPath = path.join(helper.scopes.localPath, 'components', 'global', 'bar', 'bit.json');
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        helper.addBitJsonDependencies(barJsonPath, { [`${helper.scopes.remote}/global/foo`]: '0.0.1' });
        helper.command.tagComponent('bar');
        helper.command.exportComponent('bar');
      });
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.scopeHelper.addRemoteScope();
        helper.command.importComponent('global/bar');
      });
      describe('of depth=1, "bar" depends on "foo"', () => {
        it('should create links in the component level', () => {
          const appJs = "const bar = require('bit/global/bar'); console.log(bar());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got bar and got foo');
        });
        it('should create links in the namespace level', () => {
          const appJs = "const bitGlobal = require('bit/global'); console.log(bitGlobal.bar());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got bar and got foo');
        });
        it('should create links in the root level', () => {
          const appJs = "const bit = require('bit'); console.log(bit.global.bar());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got bar and got foo');
        });
      });
      describe('of depth=2, "baz" depends on "bar" that depends on "foo"', () => {
        before(() => {
          const bazComponentFixture =
            "const bar = require('bit/global/bar'); module.exports = function baz() { return 'got baz and ' + bar(); };";
          createFile('baz', bazComponentFixture);

          const bazJsonPath = path.join(helper.scopes.localPath, 'components', 'global', 'baz', 'bit.json');
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          helper.addBitJsonDependencies(bazJsonPath, { [`${helper.scopes.remote}/global/bar`]: '0.0.1' });
          helper.command.tagComponent('baz');
          helper.command.exportComponent('baz');

          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('global/baz');
        });
        it('should create links in the component level', () => {
          const appJs = "const baz = require('bit/global/baz'); console.log(baz());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got baz and got bar and got foo');
        });
        it('should create links in the namespace level', () => {
          const appJs = "const bitGlobal = require('bit/global'); console.log(bitGlobal.baz());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got baz and got bar and got foo');
        });
        it('should create links in the root level', () => {
          const appJs = "const bit = require('bit'); console.log(bit.global.baz());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got baz and got bar and got foo');
        });
      });
    });

    describe.skip('with multiple versions', () => {
      before(() => {
        helper.scopeHelper.clean();
        helper.scopeHelper.initWorkspace();
        helper.command.runCmd('bit create foo');
        const fooComponentV1 = "module.exports = function foo() { return 'got foo v1'; };";
        fs.writeFileSync(fooImplPath, fooComponentV1);
        helper.command.runCmd('bit tag foo tag-msg1');
        helper.command.runCmd('bit modify @this/global/foo');
        const fooComponentV2 = "module.exports = function foo() { return 'got foo v2'; };";
        fs.writeFileSync(fooImplPath, fooComponentV2);
        helper.command.runCmd('bit tag foo tag-msg2');
        helper.command.runCmd('bit init --bare', helper.scopes.remotePath);
        helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath}`);
        helper.command.runCmd(`bit export @this/global/foo @${helper.scopes.remote}`);
      });
      const prepareCleanLocalEnv = () => {
        fs.emptyDirSync(helper.scopes.localPath); // a new local scope
        helper.scopeHelper.initWorkspace();
        helper.command.runCmd(`bit remote add file://${helper.scopes.remotePath}`);
      };
      describe('importing without mentioning the version', () => {
        before(() => {
          prepareCleanLocalEnv();
          helper.command.runCmd(`bit import @${helper.scopes.remote}/global/foo`);
        });
        it('should create links in the component level of the latest version', () => {
          const appJs = "const foo = require('bit/global/foo'); console.log(foo());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got foo v2');
        });
      });
      describe('importing a specific version', () => {
        before(() => {
          prepareCleanLocalEnv();
          helper.command.runCmd(`bit import @${helper.scopes.remote}/global/foo${VERSION_DELIMITER}1`);
        });
        it('should create links in the component level of that specific version', () => {
          const appJs = "const foo = require('bit/global/foo'); console.log(foo());";
          fs.outputFileSync(path.join(helper.scopes.localPath, 'app.js'), appJs);
          const result = helper.command.runCmd('node app.js');
          expect(result.trim()).to.equal('got foo v1');
        });
      });
    });
  });
});
