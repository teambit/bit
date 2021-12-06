import { expect } from 'chai';
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
    const getDeprecationData = (compId: string) => {
      const show = helper.command.showComponentParsedHarmony(compId);
      return show.find((_) => _.title === 'configuration').json.find((_) => _.id === 'teambit.component/deprecation');
    };
    it('bit show should show the component as deprecated', () => {
      const deprecationData = getDeprecationData('comp2');
      expect(deprecationData.config.deprecate).to.be.true;
    });
    it('bit status should show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponent).to.have.lengthOf(1);
      expect(status.modifiedComponent[0]).to.include('comp2');
    });
    describe('tagging the component', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      it('the component should not be modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponent).to.have.lengthOf(0);
      });
      it('bit show should show the component as deprecated', () => {
        const deprecationData = getDeprecationData('comp2');
        expect(deprecationData.config.deprecate).to.be.true;
      });
      it('.bitmap should keep containing the metadata', () => {
        const bitmap = helper.bitMap.read();
        expect(bitmap.comp2).to.have.property('metadata');
      });
      describe('exporting the component', () => {
        before(() => {
          helper.command.export();
        });
        it('should delete the metadata from the .bitmap file.', () => {
          const bitmap = helper.bitMap.read();
          expect(bitmap.comp2).to.not.have.property('metadata');
        });
        describe('testing some config-merge', () => {
          before(() => {
            helper.bitJsonc.setVariant(undefined, 'comp2', {
              'teambit.component/deprecation': { someRandomData: true },
            });
          });
          // @todo: fix. currently it overrides the data unexpectedly.
          it('should not delete the deprecation data from the config', () => {
            const deprecationData = getDeprecationData('comp2');
            expect(deprecationData.config.deprecate).to.be.true;
          });
        });
      });
    });
  });
});
