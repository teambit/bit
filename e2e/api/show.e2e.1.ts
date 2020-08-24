import { expect } from 'chai';

import * as api from '../../src/api';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('show api', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('show()', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.command.tagAllComponents();
      helper.command.tagScope('1.0.0');
      helper.command.exportAllComponents();
    });
    describe('with no options', () => {
      it('should return an object of the component with the latest version', async () => {
        const result = await api.show(helper.scopes.remotePath, `${helper.scopes.remote}/bar/foo@0.0.1`);
        expect(result).to.be.an('object');
        expect(result).to.have.property('name').that.equals('bar/foo');
      });
    });
    describe('with versions = true', () => {
      it('should return an array of all versions of the component', async () => {
        const result = await api.show(helper.scopes.remotePath, `${helper.scopes.remote}/bar/foo@0.0.1`, {
          versions: true,
        });
        expect(result).to.be.an('array').with.lengthOf(2);
        expect(result[0]).to.have.property('name').that.equals('bar/foo');
        expect(result[0]).to.have.property('version').that.equals('0.0.1');
        expect(result[1]).to.have.property('name').that.equals('bar/foo');
        expect(result[1]).to.have.property('version').that.equals('1.0.0');
      });
    });
  });
});
