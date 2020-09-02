import { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';

describe('component that requires another component file by relative path', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('2 components requires different things from the same file of another component', () => {
    let output;
    let specifiersNames;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.copyFixtureComponents('import-relative-path');
      helper.command.addComponent('import-by-2-files/a1.js import-by-2-files/a2.js', {
        i: 'comp-a',
        m: 'import-by-2-files/a1.js',
      });
      helper.command.addComponent('import-by-2-files/b.js', { i: 'comp-b' });
      output = helper.command.showComponentParsed('comp-a');
      const specifiers = output.dependencies[0].relativePaths[0].importSpecifiers;
      specifiersNames = specifiers.map((specifier) => specifier.mainFile.name);
    });
    it('should have all the import specifiers from both files', () => {
      expect(specifiersNames).to.have.members(['b1', 'b2', 'b3']);
    });
    it('should not have duplicate import specifiers', () => {
      expect(specifiersNames).to.have.lengthOf(3);
    });
    describe('adding another file that require that another component without any import specifiers', () => {
      before(() => {
        helper.command.addComponent('import-by-2-files/a3.js', { i: 'comp-a' });
      });
      describe('when the file without importSpecifier is the last file', () => {
        it('bit status should not throw an error', () => {
          const func = () => helper.command.status();
          expect(func).to.not.throw();
        });
        it('bit show should show all importSpecifiers', () => {
          const show = helper.command.showComponentParsed('comp-a');
          expect(show.dependencies[0].relativePaths[0].importSpecifiers).to.have.lengthOf(3);
        });
      });
      describe('when the file without importSpecifier is the first file', () => {
        before(() => {
          helper.fs.moveSync('import-by-2-files/a1.js', 'import-by-2-files/a4.js');
          helper.fs.moveSync('import-by-2-files/a3.js', 'import-by-2-files/a1.js');
          helper.fs.moveSync('import-by-2-files/a4.js', 'import-by-2-files/a3.js');
        });
        it('bit status should not throw an error', () => {
          const func = () => helper.command.status();
          expect(func).to.not.throw();
        });
        it('bit show should show all importSpecifiers', () => {
          const show = helper.command.showComponentParsed('comp-a');
          expect(show.dependencies[0].relativePaths[0].importSpecifiers).to.have.lengthOf(3);
        });
      });
    });
  });
});
