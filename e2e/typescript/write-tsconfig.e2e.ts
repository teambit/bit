import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('write-tsconfig command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('multiple components, most using one env', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponentsTS();
      helper.command.setEnv('comp3', 'teambit.react/react');
      helper.command.writeTsconfig();
    });
    it('should generate tsconfig.json file in the root-dir, and in the specific comp with the special env', () => {
      expect(path.join(helper.scopes.localPath, 'tsconfig.json')).to.be.a.file();
      expect(path.join(helper.scopes.localPath, 'comp3', 'tsconfig.json')).to.be.a.file();
    });
    it('bit show should not show the tsconfig.json as part of the component', () => {
      const files = helper.command.getComponentFiles('comp3');
      expect(files).to.not.include('tsconfig.json');
    });
  });
  describe('adding tsconfig.json manually in an inner directory', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(1, false);
      helper.fs.outputFile('comp1/inner/tsconfig.json');
    });
    it('should not be ignored', () => {
      const files = helper.command.getComponentFiles('comp1');
      expect(files).to.include('inner/tsconfig.json');
    });
  });
});
