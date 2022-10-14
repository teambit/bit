import { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit deprecate and undeprecate commands', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('deprecate tagged component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents();
      helper.command.tagAllWithoutBuild();
      helper.command.deprecateComponent('comp2');
    });
    it('bit show should show the component as deprecated', () => {
      const deprecationData = helper.command.showAspectConfig('comp2', Extensions.deprecation);
      expect(deprecationData.config.deprecate).to.be.true;
    });
    it('bit status should show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(1);
      expect(status.modifiedComponents[0]).to.include('comp2');
    });
    describe('tagging the component', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      it('the component should not be modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(0);
      });
      it('bit show should show the component as deprecated', () => {
        const deprecationData = helper.command.showAspectConfig('comp2', Extensions.deprecation);
        expect(deprecationData.config.deprecate).to.be.true;
      });
      it('.bitmap should not containing the config', () => {
        const bitmap = helper.bitMap.read();
        expect(bitmap.comp2).to.not.have.property('config');
      });
      it('bit list should show the component as deprecated', () => {
        const list = helper.command.listParsed();
        const comp2 = list.find((c) => c.id === `${helper.scopes.remote}/comp2`);
        expect(comp2?.deprecated).to.be.true;
      });
      describe('exporting the component', () => {
        before(() => {
          helper.command.export();
        });
        it('should delete the config from the .bitmap file.', () => {
          const bitmap = helper.bitMap.read();
          expect(bitmap.comp2).to.not.have.property('config');
        });
        describe('testing some config-merge', () => {
          before(() => {
            helper.bitJsonc.setVariant(undefined, 'comp2', {
              'teambit.component/deprecation': { someRandomData: true },
            });
          });
          // @todo: fix. currently it overrides the data unexpectedly.
          it.skip('should not delete the deprecation data from the config', () => {
            const deprecationData = helper.command.showAspectConfig('comp2', Extensions.deprecation);
            expect(deprecationData.config.deprecate).to.be.true;
          });
        });
        describe('importing a deprecated component', () => {
          let importOutput: string;
          before(() => {
            helper.scopeHelper.reInitLocalScopeHarmony();
            helper.scopeHelper.addRemoteScope();
            importOutput = helper.command.importComponent('comp2');
          });
          it('should indicate that the component is deprecated', () => {
            expect(importOutput).to.have.string('deprecated');
          });
        });
        describe('bit list of a remote deprecated component', () => {
          before(() => {
            helper.scopeHelper.reInitLocalScopeHarmony();
            helper.scopeHelper.addRemoteScope();
          });
          it('should indicate that the component is deprecated', () => {
            const list = helper.command.listRemoteScopeParsed();
            const comp2 = list.find((c) => c.id === `${helper.scopes.remote}/comp2`);
            expect(comp2.deprecated).to.equal(true);
          });
        });
      });
    });
  });
  describe('reverting the deprecation by "bit checkout reset"', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.deprecateComponent('comp1');
      // intermediate test
      const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
      expect(deprecationData.config.deprecate).to.be.true;

      helper.command.checkoutReset('comp1');
    });
    it('should remove the deprecation config', () => {
      const deprecationData = helper.command.showAspectConfig('comp1', Extensions.deprecation);
      expect(deprecationData).to.be.undefined;
    });
  });
});
