import { expect } from 'chai';
import { Extensions } from '@teambit/legacy.constants';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('bit internalize command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('internalize a tagged component', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.internalizeComponents('comp2');
    });
    it('bit show should show the component as internal', () => {
      const internalData = helper.command.showAspectConfig('comp2', Extensions.internalize);
      expect(internalData.config.internal).to.be.true;
    });
    it('the "internal" show-fragment should report isInternal true', () => {
      const data = helper.command.showComponentParsedHarmonyByTitle('comp2', 'internal');
      expect(data.isInternal).to.be.true;
    });
    it('bit status should show the component as modified', () => {
      const status = helper.command.statusJson();
      expect(status.modifiedComponents).to.have.lengthOf(1);
      expect(status.modifiedComponents[0]).to.include('comp2');
    });
    it('bit internalize --list should include only the internal component', () => {
      const list = helper.command.internalizeListParsed();
      expect(list).to.have.lengthOf(1);
      expect(list[0]).to.include('comp2');
    });
    it('the "$internal" pattern should match the internal component', () => {
      const output = helper.command.runCmd(`bit pattern '$internal'`);
      expect(output).to.have.string('comp2');
      expect(output).to.not.have.string('comp1');
    });
    describe('tagging the component', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      it('the component should not be modified', () => {
        const status = helper.command.statusJson();
        expect(status.modifiedComponents).to.have.lengthOf(0);
      });
      it('.bitmap should not contain the config', () => {
        const bitmap = helper.bitMap.read();
        expect(bitmap.comp2).to.not.have.property('config');
      });
      it('bit show should still show the component as internal', () => {
        const data = helper.command.showComponentParsedHarmonyByTitle('comp2', 'internal');
        expect(data.isInternal).to.be.true;
      });
      describe('exporting and importing into a new workspace', () => {
        before(() => {
          helper.command.export();
          helper.scopeHelper.reInitWorkspace();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('comp2');
        });
        it('the imported (remote) component should be marked as internal', () => {
          const data = helper.command.showComponentParsedHarmonyByTitle('comp2', 'internal');
          expect(data.isInternal).to.be.true;
        });
      });
    });
  });
  describe('uninternalize a component (--revert)', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(2);
      helper.command.tagAllWithoutBuild();
      helper.command.internalizeComponents('comp1');
      helper.command.uninternalizeComponents('comp1');
    });
    it('bit show should show the component as not internal', () => {
      const data = helper.command.showComponentParsedHarmonyByTitle('comp1', 'internal');
      expect(data.isInternal).to.be.false;
    });
    it('bit internalize --list should be empty', () => {
      const list = helper.command.internalizeListParsed();
      expect(list).to.have.lengthOf(0);
    });
  });
  describe('internalize multiple components by a pattern', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.internalizeComponents('**');
    });
    it('should mark all matching components as internal', () => {
      const list = helper.command.internalizeListParsed();
      expect(list).to.have.lengthOf(3);
    });
  });
  describe('reverting the internalize by "bit checkout reset"', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.internalizeComponents('comp1');
      // intermediate test
      const internalData = helper.command.showAspectConfig('comp1', Extensions.internalize);
      expect(internalData.config.internal).to.be.true;

      helper.command.checkoutReset('comp1');
    });
    it('should remove the internalize config', () => {
      const internalData = helper.command.showAspectConfig('comp1', Extensions.internalize);
      expect(internalData).to.be.undefined;
    });
  });
});
