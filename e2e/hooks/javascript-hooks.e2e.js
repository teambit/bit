import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import childProcess from 'child_process';
import { v4 } from 'uuid';
import { expect } from 'chai';

const verbose = false;
const localScope = v4();
const remoteScope = v4();
const e2eDir = path.join(os.tmpdir(), 'bit', 'e2e');
const localScopePath = path.join(e2eDir, localScope);
const remoteScopePath = path.join(e2eDir, remoteScope);

const runCmd = (cmd, cwd = localScopePath) => {
  if (verbose) console.log('running: ', cmd); // eslint-disable-line
  const cmdOutput = childProcess.execSync(cmd, { cwd });
  if (verbose) console.log(cmdOutput.toString()); // eslint-disable-line
  return cmdOutput.toString();
};

const fooComponentFixture = "module.exports = function foo() { return 'got foo'; };";
const fooImplPath = path.join(localScopePath, 'inline_components', 'global', 'foo', 'impl.js');

function expectLinksInComponentLevel() {
  const appJs = "const foo = require('bit/global/foo'); console.log(foo());";
  fs.outputFileSync(path.join(localScopePath, 'app.js'), appJs);
  const result = runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

function expectLinksInNamespaceLevel() {
  const appJs = "const bitGlobal = require('bit/global'); console.log(bitGlobal.foo());";
  fs.outputFileSync(path.join(localScopePath, 'app.js'), appJs);
  const result = runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

function expectLinksInRootLevel() {
  const appJs = "const bit = require('bit'); console.log(bit.global.foo());";
  fs.outputFileSync(path.join(localScopePath, 'app.js'), appJs);
  const result = runCmd('node app.js');
  expect(result.trim()).to.equal('got foo');
}

describe('javascript-hooks', function () {
  this.timeout(0);
  before(() => {
    runCmd('npm init -y', e2eDir);
    runCmd('npm install bit-javascript', e2eDir);
  });
  after(() => {
    fs.removeSync(localScopePath);
    fs.removeSync(remoteScopePath);
  });
  describe('onCreate', () => {
    describe('without build', () => {
      before(() => {
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit create foo');
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
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit import bit.envs/compilers/babel --compiler');
        runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        runCmd('bit build -i foo');
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
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        runCmd('bit commit foo commit-msg');
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
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit import bit.envs/compilers/babel --compiler');
        runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        runCmd('bit commit foo commit-msg'); // does the build as well
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
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        runCmd('bit commit foo commit-msg');

        fs.emptyDirSync(remoteScopePath);
        runCmd('bit init --bare', remoteScopePath);

        runCmd(`bit remote add file://${remoteScopePath}`);
        runCmd(`bit export @this/global/foo @${remoteScope}`);
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
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit import bit.envs/compilers/babel --compiler');
        runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        runCmd('bit commit foo commit-msg'); // does the build as well

        fs.emptyDirSync(remoteScopePath);
        runCmd('bit init --bare', remoteScopePath);

        runCmd(`bit remote add file://${remoteScopePath}`);
        runCmd(`bit export @this/global/foo @${remoteScope}`);
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
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        runCmd('bit commit foo commit-msg');

        fs.emptyDirSync(remoteScopePath);
        runCmd('bit init --bare', remoteScopePath);

        runCmd(`bit remote add file://${remoteScopePath}`);
        runCmd(`bit export @this/global/foo @${remoteScope}`);

        fs.emptyDirSync(localScopePath); // a new local scope
        runCmd('bit init');
        runCmd(`bit remote add file://${remoteScopePath}`);
        runCmd(`bit import @${remoteScope}/global/foo`);
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
        fs.emptyDirSync(localScopePath);
        runCmd('bit init');
        runCmd('bit import bit.envs/compilers/babel --compiler');
        runCmd('bit create foo');
        fs.writeFileSync(fooImplPath, fooComponentFixture);
        runCmd('bit commit foo commit-msg'); // does the build as well

        fs.emptyDirSync(remoteScopePath);
        runCmd('bit init --bare', remoteScopePath);

        runCmd(`bit remote add file://${remoteScopePath}`);
        runCmd(`bit export @this/global/foo @${remoteScope}`);

        fs.emptyDirSync(localScopePath); // a new local scope
        runCmd('bit init');
        runCmd(`bit remote add file://${remoteScopePath}`);
        runCmd(`bit import @${remoteScope}/global/foo`);
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
