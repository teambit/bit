import { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

describe('bit fork command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('fork with dependencies', () => {
    let forkScope;
    let forkScopePath;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateWorkspaceWithComponents();
      helper.command.tagAllComponents();
      helper.command.exportAllComponents();
      const { scopeName, scopePath } = helper.scopeHelper.getNewBareScope();
      forkScope = scopeName;
      forkScopePath = scopePath;
      helper.scopeHelper.addRemoteScope(forkScopePath);
    });
    describe('with id and --dependencies flag', () => {
      let output;
      let forkScopeIds;
      before(() => {
        output = helper.command.fork(`${forkScope} utils/is-string --dependencies`);
        const forkScopeList = helper.command.listScopeParsed(forkScope);
        forkScopeIds = forkScopeList.map(c => c.id);
      });
      it('should fork the component', () => {
        expect(output).to.have.string(`${forkScope}/utils/is-string`);
        expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-string`);
      });
      it('should fork the dependencies', () => {
        expect(output).to.have.string(`${forkScope}/utils/is-type`);
        expect(forkScopeIds).to.deep.include(`${forkScope}/utils/is-type`);
      });
      it('should not fork other components', () => {
        expect(output).to.not.have.string(`${forkScope}/bar/foo`);
        expect(forkScopeIds).to.not.deep.include(`${forkScope}/bar/foo`);
      });
    });
  });
});
