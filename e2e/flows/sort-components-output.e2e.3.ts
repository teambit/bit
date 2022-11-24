import { expect } from 'chai';
import fs from 'fs-extra';
import * as path from 'path';
import Helper from '../../src/e2e-helper/e2e-helper';

/**
 * expect the components 'comp1', 'comp2', 'comp3' to be sorted in this order
 */
function expectComponentsToBeSortedAlphabetically(output, start = 0) {
  expect(output.indexOf('comp1', start)).to.be.below(output.indexOf('comp2', start));
  expect(output.indexOf('comp2', start)).to.be.below(output.indexOf('comp3', start));
}

describe('basic flow with dependencies', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('after adding components', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesWithDefault();
      helper.fixtures.populateComponents();
    });
    describe('bit status', () => {
      let output;
      before(() => {
        output = helper.command.runCmd('bit status');
      });
      it('should show all of them under new components', () => {
        expect(output).to.not.have.string('no new components');
        expect(output).to.have.string('new components');
      });
      it('should show new components sorted alphabetically', () => {
        expectComponentsToBeSortedAlphabetically(output);
      });
    });
    it('bit list --scope should not show any component', () => {
      const output = helper.command.listLocalScope();
      expect(output).to.have.string('found 0 components');
    });
    describe('after tagging the components', () => {
      before(() => {
        helper.command.tagAllWithoutBuild();
      });
      describe('bit status', () => {
        let output;
        before(() => {
          output = helper.command.runCmd('bit status');
        });
        it('should show all of them under staged components', () => {
          expect(output).to.not.have.string('no staged components');
          expect(output).to.have.string('staged components');
        });
        it('should show staged components sorted alphabetically', () => {
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
      it('bit list should show the components sorted alphabetically', () => {
        const output = helper.command.listLocalScope();
        expectComponentsToBeSortedAlphabetically(output);
      });
      describe('after modifying the components', () => {
        before(() => {
          helper.fixtures.populateComponents(undefined, undefined, 'v2');
        });
        describe('bit status', () => {
          let output;
          before(() => {
            output = helper.command.runCmd('bit status');
          });
          it('should show all of them under staged components', () => {
            expect(output).to.not.have.string('no staged components');
            expect(output).to.have.string('staged components');
          });
          it('should show staged components sorted alphabetically', () => {
            expectComponentsToBeSortedAlphabetically(output);
          });
        });
        it('bit list should show the components sorted alphabetically', () => {
          const output = helper.command.listLocalScope();
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
      describe('after deleting the components', () => {
        before(() => {
          fs.moveSync(path.join(helper.scopes.localPath, 'comp1'), path.join(helper.scopes.localPath, 'comp1-bak'));
          fs.moveSync(path.join(helper.scopes.localPath, 'comp2'), path.join(helper.scopes.localPath, 'comp2-bak'));
          fs.moveSync(path.join(helper.scopes.localPath, 'comp3'), path.join(helper.scopes.localPath, 'comp3-bak'));
        });
        after(() => {
          fs.moveSync(path.join(helper.scopes.localPath, 'comp1-bak'), path.join(helper.scopes.localPath, 'comp1'));
          fs.moveSync(path.join(helper.scopes.localPath, 'comp2-bak'), path.join(helper.scopes.localPath, 'comp2'));
          fs.moveSync(path.join(helper.scopes.localPath, 'comp3-bak'), path.join(helper.scopes.localPath, 'comp3'));
        });
        describe('bit status', () => {
          let output;
          before(() => {
            output = helper.command.runCmd('bit status');
          });
          it('should show all of them under deleted components', () => {
            expect(output).to.have.string('component files were deleted');
          });
          it('should show deleted components sorted alphabetically', () => {
            expectComponentsToBeSortedAlphabetically(output);
          });
        });
        it('bit list should show the components sorted alphabetically', () => {
          const output = helper.command.listLocalScope();
          expectComponentsToBeSortedAlphabetically(output);
        });
      });
    });
  });
});
