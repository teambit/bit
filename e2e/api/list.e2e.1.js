import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as api from '../../src/api';

describe('api', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('list()', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
    });
    it('should list the ids of the remote scope', async () => {
      const result = await api.list(helper.scopes.remotePath);
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.equal(`${helper.scopes.remote}/bar/foo@0.0.1`);
    });
  });
});
