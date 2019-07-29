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
    describe('adding another file that require that another component without any import specifiers', () => {
      before(() => {
        helper.addComponent('import-by-2-files/a3.js', { i: 'comp-a' });
      });
      describe('when the file without importSpecifier is the last file', () => {
        it('bit status should not throw an error', () => {
          const func = () => helper.status();
          expect(func).to.not.throw();
        });
        it('bit show should show all importSpecifiers', () => {
          const show = helper.showComponentParsed('comp-a');
          expect(show.dependencies[0].relativePaths[0].importSpecifiers).to.have.lengthOf(3);
        });
      });
      describe('when the file without importSpecifier is the first file', () => {
        before(() => {
          helper.moveSync('import-by-2-files/a1.js', 'import-by-2-files/a4.js');
          helper.moveSync('import-by-2-files/a3.js', 'import-by-2-files/a1.js');
          helper.moveSync('import-by-2-files/a4.js', 'import-by-2-files/a3.js');
        });
        it('bit status should not throw an error', () => {
          const func = () => helper.status();
          expect(func).to.not.throw();
        });
        it('bit show should show all importSpecifiers', () => {
          const show = helper.showComponentParsed('comp-a');
          expect(show.dependencies[0].relativePaths[0].importSpecifiers).to.have.lengthOf(3);
        });
      });
    });
  });
});
