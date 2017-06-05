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

    describe('with dependencies', () => {
      before(() => {
        helper.cleanEnv();
        helper.runCmd('bit init');
        helper.runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        helper.runCmd('bit commit foo commit-msg');

        helper.runCmd('bit init --bare', helper.remoteScopePath);
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit export @this/global/foo @${helper.remoteScope}`);

        const barComponentFixture = "const foo = require('bit/global/foo'); module.exports = function bar() { return 'got bar and ' + foo(); };";
        const barImplPath = path.join(helper.localScopePath, 'inline_components', 'global', 'bar', 'impl.js');
        helper.runCmd('bit create bar --json');
        fs.writeFileSync(barImplPath, barComponentFixture);
        const barJsonPath = path.join(helper.localScopePath, 'inline_components', 'global', 'bar', 'bit.json');
        const barJson = JSON.parse(fs.readFileSync(barJsonPath).toString());
        barJson.dependencies[`@${helper.remoteScope}/global/foo`] = '1';
        fs.writeFileSync(barJsonPath, JSON.stringify(barJson, null, 4));
        helper.runCmd('bit commit bar commit-msg');
        helper.runCmd(`bit export @this/global/bar @${helper.remoteScope}`);
      });
      before(() => {
        fs.emptyDirSync(helper.localScopePath); // a new local scope
        helper.runCmd('bit init');
        helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
        helper.runCmd(`bit import @${helper.remoteScope}/global/bar`);
      });
      describe('of depth=1, "bar" depends on "foo"', () => {
        it('should create links in the component level', () => {
          const appJs = "const bar = require('bit/global/bar'); console.log(bar());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got bar and got foo');
        });
        it('should create links in the namespace level', () => {
          const appJs = "const bitGlobal = require('bit/global'); console.log(bitGlobal.bar());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got bar and got foo');
        });
        it('should create links in the root level', () => {
          const appJs = "const bit = require('bit'); console.log(bit.global.bar());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got bar and got foo');
        });
      });
      describe('of depth=2, "baz" depends on "bar" that depends on "foo"', () => {
        before(() => {
          const bazComponentFixture = "const bar = require('bit/global/bar'); module.exports = function baz() { return 'got baz and ' + bar(); };";
          const bazImplPath = path.join(helper.localScopePath, 'inline_components', 'global', 'baz', 'impl.js');
          helper.runCmd('bit create baz --json');
          fs.writeFileSync(bazImplPath, bazComponentFixture);
          const bazJsonPath = path.join(helper.localScopePath, 'inline_components', 'global', 'baz', 'bit.json');
          const bazJson = JSON.parse(fs.readFileSync(bazJsonPath).toString());
          bazJson.dependencies[`@${helper.remoteScope}/global/bar`] = '1';
          fs.writeFileSync(bazJsonPath, JSON.stringify(bazJson, null, 4));
          helper.runCmd('bit commit baz commit-msg');
          helper.runCmd(`bit export @this/global/baz @${helper.remoteScope}`);

          fs.emptyDirSync(helper.localScopePath); // a new local scope
          helper.runCmd('bit init');
          helper.runCmd(`bit remote add file://${helper.remoteScopePath}`);
          helper.runCmd(`bit import @${helper.remoteScope}/global/baz`);
        });
        it('should create links in the component level', () => {
          const appJs = "const baz = require('bit/global/baz'); console.log(baz());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got baz and got bar and got foo');
        });
        it('should create links in the namespace level', () => {
          const appJs = "const bitGlobal = require('bit/global'); console.log(bitGlobal.baz());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got baz and got bar and got foo');
        });
        it('should create links in the root level', () => {
          const appJs = "const bit = require('bit'); console.log(bit.global.baz());";
          fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJs);
          const result = helper.runCmd('node app.js');
          expect(result.trim()).to.equal('got baz and got bar and got foo');
        });
      });
    });
  });
});
