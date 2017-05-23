import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

const helper = new Helper();
const fooComponentFixture = "module.exports = function foo() { return 'got foo'; };";
const fooImplPath = path.join(helper.localScopePath, 'inline_components', 'global', 'foo', 'impl.js');

function expectLinksInComponentLevel() {
  const appJs = "const foo = require('bit/global/foo'); console.log(foo());";
  fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
  const result = helper.runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

function expectLinksInNamespaceLevel() {
  const appJs = "const bitGlobal = require('bit/global'); console.log(bitGlobal.foo());";
  fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
  const result = helper.runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

function expectLinksInRootLevel() {
  const appJs = "const bit = require('bit'); console.log(bit.global.foo());";
  fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
  const result = helper.runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

describe('javascript-hooks', function () {
  this.timeout(0);
  before(() => {
    helper.runCmd('npm init -y', helper.e2eDir);
    helper.runCmd('npm install bit-javascript', helper.e2eDir);
  });
  after(() => {
    helper.destroyEnv();
  });
  describe('onCreate', () => {
    describe('without build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
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
    describe('with build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit import bit.envs/compilers/babel --compiler');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit build -i foo');
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

  describe('onCommit', () => {
    describe('without build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit commit foo commit-msg');
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

    describe('with build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit import bit.envs/compilers/babel --compiler');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit commit foo commit-msg'); // does the build as well
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

  describe('onExport', () => {
    describe('without build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit commit foo commit-msg');
        helper.runCmd('bit init --bare', helper.remoteScopePath);
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit export @this/global/foo @${helper.remoteScope}`);
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

    describe('with build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit import bit.envs/compilers/babel --compiler');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit commit foo commit-msg'); // does the build as well
        helper.runCmd('bit init --bare', helper.remoteScopePath);
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit export @this/global/foo @${helper.remoteScope}`);
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

  describe('onImport', () => {
    describe('without build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit commit foo commit-msg');
        helper.runCmd('bit init --bare', helper.remoteScopePath);
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit export @this/global/foo @${helper.remoteScope}`);
        fs.emptyDirSync(helper.localScopePath); // a new local scope
        helper.runCmd('bit init');
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit import @${helper.remoteScope}/global/foo`);
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

    describe('with build', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit import bit.envs/compilers/babel --compiler');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit commit foo commit-msg'); // does the build as well
        helper.runCmd('bit init --bare', helper.remoteScopePath);
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit export @this/global/foo @${helper.remoteScope}`);
        fs.emptyDirSync(helper.localScopePath); // a new local scope
        helper.runCmd('bit init');
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit import @${helper.remoteScope}/global/foo`);
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
});

// scenarios todo:
// 1. a new component bar with a dependency of foo.
// 2. a new component baz with a dependency of bar. (deep = 2).
// 3. same component, one in inline_component and the other in components directory, it should use the inline one.
// 4. a component with multiple versions
