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
  // the two no-warning cases used to be two describes, each paying for its own workspace + remote.
  // they exercise different early-returns in warnAboutRemoteIdCollisions - an already-exported id is
  // dropped by the isExported filter before any remote call, while a brand-new id passes that filter
  // and gets an empty result back from the remote - so both are kept, but one workspace serves both.
  // sharing it also makes the second case stricter than it was: the remote here actually holds comp1,
  // so a passing assertion proves the check discriminates by id rather than just seeing an empty remote.
  describe('bit add when the id does not legitimately collide', () => {
    let reAddOutput: string;
    let newCompOutput: string;
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      // re-track the same (already exported) component - its id legitimately exists on the remote.
      helper.fs.outputFile('comp1/index.js', "module.exports = () => 'comp1 v2';");
      reAddOutput = helper.command.add('comp1');
      // a brand new id that is not on the remote at all.
      helper.fs.outputFile('comp-new/index.js', "module.exports = () => 'new';");
      newCompOutput = helper.command.add('comp-new');
    });
    it('should not warn for an already-exported component', () => {
      expect(reAddOutput).to.not.have.string('already exist on the remote scope');
    });
    it('should not warn for a brand new id that does not exist on the remote', () => {
      expect(newCompOutput).to.not.have.string('already exist on the remote scope');
    });
  });
});
