import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('component that requires another component file by relative path', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('2 components requires different things from the same file of another component', () => {
    let output;
    let specifiersNames;
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.reInitLocalScope();
      helper.copyFixtureComponents('import-relative-path');
      helper.addComponent('import-by-2-files/a1.js import-by-2-files/a2.js', {
        i: 'comp-a',
        m: 'import-by-2-files/a1.js'
      });
      helper.addComponent('import-by-2-files/b.js', { i: 'comp-b' });
      output = helper.showComponentParsed('comp-a');
      const specifiers = output.dependencies[0].relativePaths[0].importSpecifiers;
      specifiersNames = specifiers.map(specifier => specifier.mainFile.name);
    });
    it('should have all the import specifiers from both files', () => {
      expect(specifiersNames).to.have.members(['b1', 'b2', 'b3']);
    });

    it('should not have duplicate import specifiers', () => {
      expect(specifiersNames).to.have.lengthOf(3);
    });
  });
});
