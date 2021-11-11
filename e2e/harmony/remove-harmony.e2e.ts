import chai, { expect } from 'chai';
import path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('remove components on Harmony', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('remove new component without --delete-files flag', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.removeComponent('comp1');
    });
    it('should remove the component from .bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp1');
    });
    it('should not delete the directory from the filesystem', () => {
      expect(path.join(helper.scopes.localPath, 'comp1')).to.be.a.directory();
    });
    it('should delete the directory from the node_modules', () => {
      expect(path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}`, 'comp1')).to.not.be.a.path();
    });
  });
  describe('remove new component with --delete-files flag', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.removeComponent('comp1', '--delete-files');
    });
    it('should remove the component from .bitmap', () => {
      const bitMap = helper.bitMap.read();
      expect(bitMap).to.not.have.property('comp1');
    });
    it('should delete the directory from the filesystem', () => {
      expect(path.join(helper.scopes.localPath, 'comp1')).to.not.be.a.path();
    });
    it('should delete the directory from the node_modules', () => {
      expect(path.join(helper.scopes.localPath, `node_modules/@${helper.scopes.remote}`, 'comp1')).to.not.be.a.path();
    });
  });
  describe('remove a component that has dependents', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(3);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
    });
    describe('without force', () => {
      let output: string;
      it('should not allow removing', () => {
        output = helper.command.removeComponent('comp3');
        expect(output).to.have.string('unable to delete');
      });
    });
    describe('with force', () => {
      let output: string;
      before(() => {
        output = helper.command.removeComponent('comp3', '--force');
      });
      it('should indicate in the output that the component was archived', () => {
        expect(output).to.have.string('successfully archived');
      });
      it('bit list should show it as archived', () => {
        const list = helper.command.listLocalScopeParsed();
        const comp3 = list.find((l) => l.id === `${helper.scopes.remote}/comp3`);
        expect(comp3?.archived).to.be.true;
      });
      it('should delete it from the .bitmap file', () => {
        const bitMap = helper.bitMap.read();
        expect(bitMap).to.not.have.property('comp3');
      });
    });
  });
});
