import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import * as api from '../../src/api';

describe('api', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('list()', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagAllComponents();
      helper.exportAllComponents();
    });
    it('should list the ids of the remote scope', async () => {
      const result = await api.list(helper.remoteScopePath);
      expect(result).to.be.an('array');
      expect(result).to.have.lengthOf(1);
      expect(result[0]).to.equal(`${helper.remoteScope}/bar/foo@0.0.1`);
    });
  });
});
