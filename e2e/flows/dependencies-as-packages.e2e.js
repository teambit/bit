import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

describe('installing dependencies as packages (not as components)', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('components with nested dependencies', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.bindingPrefix = '@ci';
      helper.writeBitJson(bitJson);
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.commitAllComponents();
      helper.exportAllComponents();
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');

      helper.importNpmPackExtension();
      helper.publishComponentToCIRegistry('utils/is-type');
      helper.publishComponentToCIRegistry('utils/is-string');
      helper.publishComponentToCIRegistry('bar/foo');

      helper.reInitLocalScope();
      helper.runCmd('npm init -y');
      helper.runCmd(`npm install @ci/${helper.remoteScope}.bar.foo`);
    });
    it.only('should be able to require its direct dependency and print results from all dependencies', () => {
      const appJsFixture = `const barFoo = require('@ci/${helper.remoteScope}.bar.foo'); console.log(barFoo());`;
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
});
