import { expect } from 'chai';
import fs from 'fs-extra';
import path from 'path';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

describe('capsule', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('new components with dependencies (untagged)', () => {
    const capsuleDir = helper.generateRandomTmpDirName();
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createFile('utils', 'is-type.js', fixtures.isType);
      helper.addComponentUtilsIsType();
      helper.createFile('utils', 'is-string.js', fixtures.isString);
      helper.addComponentUtilsIsString();
      helper.createComponentBarFoo(fixtures.barFooFixture);
      helper.addComponentBarFoo();
      helper.runCmd(`bit isolate bar/foo --use-capsule --directory ${capsuleDir}`);
      fs.outputFileSync(path.join(capsuleDir, 'app.js'), fixtures.appPrintBarFoo);
    });
    it('should have the components and dependencies installed correctly with all the links', () => {
      const result = helper.runCmd('node app.js', capsuleDir);
      expect(result.trim()).to.equal('got is-type and got is-string and got foo');
    });
  });
});
