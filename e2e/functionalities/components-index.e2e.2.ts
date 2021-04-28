import chai, { expect } from 'chai';

import Helper from '../../src/e2e-helper/e2e-helper';
import OutdatedIndexJson from '../../src/scope/exceptions/outdated-index-json';

chai.use(require('chai-fs'));

describe('scope components index mechanism', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
    helper.command.setFeatures('legacy-workspace-config');
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('after tagging a component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();
    });
    it('should save the component in the index.json file', () => {
      const indexJson = helper.general.getComponentsFromIndexJson();
      expect(indexJson).to.have.lengthOf(1);
      const indexItem = indexJson[0];
      expect(indexItem).to.have.property('id');
      expect(indexItem).to.have.property('hash');
      expect(indexItem).to.have.property('isSymlink');
      expect(indexItem.id.scope).to.be.null;
      expect(indexItem.isSymlink).to.be.false;
      expect(indexItem.hash).to.equal('ceb1a787ad7f07dd8a289d2c4c34aee239367a66');
    });
    describe('after exporting the component', () => {
      before(() => {
        helper.command.exportAllComponents();
      });
      it('should create a new record with the new scope', () => {
        const indexJson = helper.general.getComponentsFromIndexJson();
        const scopes = indexJson.map((item) => item.id.scope);
        expect(scopes).to.contain(helper.scopes.remote);
      });
      it('should change the previous record to be a symlink', () => {
        const indexJson = helper.general.getComponentsFromIndexJson();
        const indexItem = indexJson.find((item) => !item.id.scope);
        expect(indexItem.isSymlink).to.be.true;
      });
      it('bit list should show only one component', () => {
        const list = helper.command.listLocalScopeParsed();
        expect(list).to.have.lengthOf(1);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        expect(list[0].id).to.contain(helper.scopes.remote);
      });
      describe('removing the component', () => {
        before(() => {
          helper.command.removeComponent('bar/foo');
        });
        it('should remove the record from index.json', () => {
          const indexJson = helper.general.getComponentsFromIndexJson();
          expect(indexJson).to.have.lengthOf(0);
        });
        it('bit list should show zero components', () => {
          const list = helper.command.listLocalScopeParsed();
          expect(list).to.have.lengthOf(0);
        });
      });
      describe('importing the component to a new scope', () => {
        before(() => {
          helper.scopeHelper.reInitLocalScope();
          helper.scopeHelper.addRemoteScope();
          helper.command.importComponent('bar/foo');
        });
        it('should populate the index.json', () => {
          const indexJson = helper.general.getComponentsFromIndexJson();
          expect(indexJson).to.have.lengthOf(1);
        });
        describe('removing the component', () => {
          before(() => {
            helper.command.removeComponent('bar/foo');
          });
          it('should remove the record from index.json', () => {
            const indexJson = helper.general.getComponentsFromIndexJson();
            expect(indexJson).to.have.lengthOf(0);
          });
          it('bit list should show zero components', () => {
            const list = helper.command.listLocalScopeParsed();
            expect(list).to.have.lengthOf(0);
          });
        });
      });
    });
  });
  describe('changing the index.json file manually to be empty', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScope();
      helper.fixtures.createComponentBarFoo();
      helper.fixtures.addComponentBarFoo();
      helper.fixtures.tagComponentBarFoo();

      // as an intermediate step, make sure bit list shows one component
      const list = helper.command.listLocalScopeParsed();
      expect(list).to.have.lengthOf(1);

      helper.general.writeIndexJson([]);
    });
    it('bit list should show zero results as it uses the index.json file', () => {
      const list = helper.command.listLocalScopeParsed();
      expect(list).to.have.lengthOf(0);
    });
    it('bit cat-scope should still show the component as it should not be affected by the cache', () => {
      const catScope = helper.command.catScope();
      expect(catScope).to.have.lengthOf(1);
    });
    describe('running bit init --reset', () => {
      before(() => {
        helper.command.runCmd('bit init --reset');
      });
      it('should rebuild index.json with the missing components', () => {
        const indexJson = helper.general.getComponentsFromIndexJson();
        expect(indexJson).to.have.lengthOf(1);
      });
      it('bit list should show 1 component', () => {
        const list = helper.command.listLocalScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
    });
  });
  describe('outdated / out-of-sync index.json', () => {
    describe('adding a non-exist component to index.json', () => {
      before(() => {
        helper.scopeHelper.reInitLocalScope();
        helper.fixtures.createComponentBarFoo();
        helper.fixtures.addComponentBarFoo();
        helper.command.tagAllComponents();
        const indexJsonWithBarFoo = helper.general.getComponentsFromIndexJson();
        helper.command.untag('bar/foo');
        helper.general.writeIndexJson(indexJsonWithBarFoo);
        // now, index.json has barFoo, however the scope doesn't have it
      });
      it('bit status should throw an error for the first time and then should work on the second run', () => {
        // used to show "Cannot read property 'scope' of null"
        const error = new OutdatedIndexJson('component "bar/foo"', helper.general.indexJsonPath());
        const statusCmd = () => helper.command.status();
        helper.general.expectToThrow(statusCmd, error);

        const secondRun = () => helper.command.status();
        expect(secondRun).not.to.throw();
      });
    });
  });
});
