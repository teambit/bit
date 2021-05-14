import chai, { expect } from 'chai';
import path from 'path';

import { WORKSPACE_JSONC } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('migrating legacy workspace to Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('running bit migrate --harmony on a legacy workspace with multiple components', () => {
    let output;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(3, false, undefined, false);
      output = helper.command.runCmd('bit migrate --harmony');
    });
    it('should keep .bitmap file', () => {
      const bitmap = helper.bitMap.readComponentsMapOnly();
      expect(Object.keys(bitmap).length).to.equal(3);
    });
    it('should backup and remove bit.json file', () => {
      expect(path.join(helper.scopes.localPath, 'bit.json')).to.not.be.a.path();
      expect(path.join(helper.scopes.localPath, 'bit.json.legacy')).to.be.a.file();
    });
    it('should create workspace.jsonc file', () => {
      expect(path.join(helper.scopes.localPath, WORKSPACE_JSONC)).to.be.a.file();
    });
    it('should indicate in the output about moving the bit.json file', () => {
      expect(output).to.have.string('has been renamed to include ".legacy" suffix');
    });
  });
});
