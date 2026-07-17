import { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';

describe('creating a new component whose id already exists on the remote', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('bit add of a component with the same id as an existing remote component (unrelated history)', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // fresh workspace pointing at the same remote, create an unrelated component with the same id.
      // (reInitWorkspace keeps the remote intact, unlike setWorkspaceWithRemoteScope which re-inits it)
      helper.scopeHelper.reInitWorkspace();
      helper.scopeHelper.addRemoteScope();
      helper.fs.outputFile('comp1/index.js', "module.exports = () => 'unrelated';");
      output = helper.command.add('comp1');
    });
    it('should warn that the component already exists on the remote scope', () => {
      expect(output).to.have.string('already exist on the remote scope');
    });
    it('should suggest "bit import" to adopt the existing component', () => {
      expect(output).to.have.string('bit import');
    });
    it('should suggest "bit rename" to keep it as a separate component', () => {
      expect(output).to.have.string('bit rename');
    });
    it('should still track the component (the warning is non-blocking)', () => {
      const bitMap = helper.bitMap.readComponentsMapOnly();
      expect(Object.keys(bitMap)).to.have.lengthOf(1);
    });
  });
  describe('bit add of a brand new component that does not exist on the remote', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fs.outputFile('comp-new/index.js', "module.exports = () => 'new';");
      output = helper.command.add('comp-new');
    });
    it('should not warn about a remote collision', () => {
      expect(output).to.not.have.string('already exist on the remote scope');
    });
  });
  describe('re-adding a component that was already exported (remote existence is expected)', () => {
    let output: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // re-track the same (already exported) component - its id legitimately exists on the remote.
      helper.fs.outputFile('comp1/index.js', "module.exports = () => 'comp1 v2';");
      output = helper.command.add('comp1');
    });
    it('should not warn about a remote collision for an already-exported component', () => {
      expect(output).to.not.have.string('already exist on the remote scope');
    });
  });
});
