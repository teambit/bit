import chai, { expect } from 'chai';
import path from 'path';

import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { SchemaName } from '../../src/consumer/component/component-schema';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('tag components on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures(HARMONY_FEATURE);
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('workspace with standard components', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.scopeHelper.addRemoteScope();
      helper.command.importComponent('comp1');
    });
    it('should import successfully with the schema prop', () => {
      const comp1 = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
      expect(comp1).to.have.property('schema');
      expect(comp1.schema).to.equal(SchemaName.Harmony);
    });
    it('bit status should work and not show modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.be.empty;
    });
    it('should create symlink from the workspace node_modules to the component node_modules after bit link', () => {
      // before the link, the node_modules is created for the dependencies. as such, it happens
      // at the same time this link is generated, which causes race condition. in a real world
      // this won't happen because "bit install" will create the node_modules dir before the link
      // starts.
      helper.command.link();
      expect(
        path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}/comp1/node_modules`)
      ).to.be.a.directory();
    });
  });
});
