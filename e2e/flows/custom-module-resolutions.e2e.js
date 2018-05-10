import chai, { expect } from 'chai';
import Helper from '../e2e-helper';
import * as fixtures from '../fixtures/fixtures';

chai.use(require('chai-fs'));

describe('custom module resolutions', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('using custom module directory', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      const bitJson = helper.readBitJson();
      bitJson.resolveModules = { modulesDirectories: 'src' };
      helper.writeBitJson(bitJson);

      helper.createFile('src/utils', 'is-type.js', fixtures.isType);
      const isStringFixture =
        "const isType = require('utils/is-type.js'); module.exports = function isString() { return isType() +  ' and got is-string'; };";
      const barFooFixture =
        "const isString = require('utils/is-string.js'); module.exports = function foo() { return isString() + ' and got foo'; };";
      helper.createFile('src/utils', 'is-string.js', isStringFixture);
      helper.createFile('src/bar', 'foo.js', barFooFixture);
      helper.addComponent('src/utils/is-type.js');
      helper.addComponent('src/utils/is-string.js');
      helper.addComponent('src/bar/foo.js');
    });
    it('bit status should not warn about missing packages', () => {
      const output = helper.runCmd('bit status');
      expect(output).to.not.have.string('missing');
    });
    it('bit show should show the dependencies correctly', () => {
      const output = helper.showComponentParsed('bar/foo');
      expect(output.dependencies).to.have.lengthOf(1);
      const dependency = output.dependencies[0];
      expect(dependency.id).to.equal('utils/is-string');
      expect(dependency.relativePaths[0].sourceRelativePath).to.equal('src/utils/is-string.js');
      expect(dependency.relativePaths[0].destinationRelativePath).to.equal('src/utils/is-string.js');
    });
  });
});
