import chai, { expect } from 'chai';
import { HARMONY_FEATURE } from '../../src/api/consumer/lib/feature-toggle';
import { Extensions } from '../../src/constants';
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
    describe('tag without build after full tag', () => {
      before(() => {
        helper.command.tagAllWithoutBuild('-s 1.0.0');
      });
      it('should not save the builder data from the previous version', () => {
        const comp = helper.command.catComponent(`${helper.scopes.remote}/comp1@latest`);
        const builder = helper.general.getExtension(comp, Extensions.builder);
        expect(builder.data).to.not.have.property('pipeline');
        expect(builder.data).to.not.have.property('artifacts');
      });
      it('should be able to export successfully', () => {
        expect(() => helper.command.export()).to.not.throw();
      });
    });
  });
});
