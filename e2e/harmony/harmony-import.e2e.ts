import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { SchemaName } from '../../src/consumer/component/component-schema';

chai.use(require('chai-fs'));

describe('import component on Harmony', function () {
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
      helper.fixtures.populateComponents();
      helper.command.linkAndRewire();
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
    // @todo: currently it shows an error "packageNameToComponentId unable to determine the id of comp2, it has no dot and is not exists on .bitmap"
    it.skip('bit status should work', () => {});
  });
});
