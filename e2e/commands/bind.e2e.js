import path from 'path';
import fs from 'fs-extra';
import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit bind', function () {
  this.timeout(0);
  const helper = new Helper();

  after(() => {
    helper.destroyEnv();
  });

  describe('author components', () => {
    before(() => {
      helper.reInitLocalScope();
      const isTypeFixture = "module.exports = function isType() { return 'got is-type'; };";
      helper.createComponent('utils', 'is-type.js', isTypeFixture);
      helper.addComponent('utils/is-type.js');
      const isStringFixture =
        "const isType = require('bit/utils/is-type/utils/is-type'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      helper.createComponent('utils', 'is-string.js', isStringFixture);
      helper.addComponent('utils/is-string.js');
      helper.runCmd('bit bind');
    });
    it('should print results from the dependency that uses require(bit) syntax', () => {
      const appJsFixture = "const isString = require('./utils/is-string'); console.log(isString());";
      fs.outputFileSync(path.join(helper.localScopePath, 'app.js'), appJsFixture);
      const result = helper.runCmd('node app.js');
      expect(result.trim()).to.equal('got is-type and got is-string');
    });
  });
});
