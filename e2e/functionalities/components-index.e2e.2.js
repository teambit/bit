import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';
import OutdatedIndexJson from '../../src/scope/exceptions/outdated-index-json';

chai.use(require('chai-fs'));

describe('scope components index mechanism', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when a scope has no components', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.listLocalScope();
    });
    it('the index.json file should be an empty array', () => {
      expect(helper.indexJsonPath()).to.be.a.file();
      const indexJson = helper.getIndexJson();
      expect(indexJson).to.deep.equal([]);
    });
  });
  describe('after tagging a component', () => {
    before(() => {
      helper.setNewLocalAndRemoteScopes();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();
    });
    it('should save the component in the index.json file', () => {
      const indexJson = helper.getIndexJson();
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
        helper.exportAllComponents();
      });
      it('should create a new record with the new scope', () => {
        const indexJson = helper.getIndexJson();
        const scopes = indexJson.map(item => item.id.scope);
        expect(scopes).to.contain(helper.remoteScope);
      });
      it('should change the previous record to be a symlink', () => {
        const indexJson = helper.getIndexJson();
        const indexItem = indexJson.find(item => !item.id.scope);
        expect(indexItem.isSymlink).to.be.true;
      });
      it('bit list should show only one component', () => {
        const list = helper.listLocalScopeParsed();
        expect(list).to.have.lengthOf(1);
        expect(list[0].id).to.contain(helper.remoteScope);
      });
      describe('removing the component', () => {
        before(() => {
          helper.removeComponent('bar/foo', '-s');
        });
        it('should remove the record from index.json', () => {
          const indexJson = helper.getIndexJson();
          expect(indexJson).to.have.lengthOf(0);
        });
        it('bit list should show zero components', () => {
          const list = helper.listLocalScopeParsed();
          expect(list).to.have.lengthOf(0);
        });
      });
      describe('importing the component to a new scope', () => {
        before(() => {
          helper.reInitLocalScope();
          helper.addRemoteScope();
          helper.importComponent('bar/foo');
        });
        it('should populate the index.json', () => {
          const indexJson = helper.getIndexJson();
          expect(indexJson).to.have.lengthOf(1);
        });
        describe('removing the component', () => {
          before(() => {
            helper.removeComponent('bar/foo', '-s');
          });
          it('should remove the record from index.json', () => {
            const indexJson = helper.getIndexJson();
            expect(indexJson).to.have.lengthOf(0);
          });
          it('bit list should show zero components', () => {
            const list = helper.listLocalScopeParsed();
            expect(list).to.have.lengthOf(0);
          });
        });
      });
    });
  });
  describe('changing the index.json file manually to be empty', () => {
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.tagComponentBarFoo();

      // as an intermediate step, make sure bit list shows one component
      const list = helper.listLocalScopeParsed();
      expect(list).to.have.lengthOf(1);

      helper.writeIndexJson([]);
    });
    it('bit list should show zero results as it uses the index.json file', () => {
      const list = helper.listLocalScopeParsed();
      expect(list).to.have.lengthOf(0);
    });
    it('bit cat-scope should still show the component as it should not be affected by the cache', () => {
      const catScope = helper.catScope();
      expect(catScope).to.have.lengthOf(1);
    });
    describe('running bit init --reset', () => {
      before(() => {
        helper.runCmd('bit init --reset');
      });
      it('should rebuild index.json with the missing components', () => {
        const indexJson = helper.getIndexJson();
        expect(indexJson).to.have.lengthOf(1);
      });
      it('bit list should show 1 component', () => {
        const list = helper.listLocalScopeParsed();
        expect(list).to.have.lengthOf(1);
      });
    });
  });
  describe('outdated / out-of-sync index.json', () => {
    describe('adding a non-exist component to index.json', () => {
      before(() => {
        helper.reInitLocalScope();
        helper.createComponentBarFoo();
        helper.addComponentBarFoo();
        helper.tagAllComponents();
        const indexJsonWithBarFoo = helper.getIndexJson();
        helper.untag('bar/foo');
        helper.writeIndexJson(indexJsonWithBarFoo);
        // now, index.json has barFoo, however the scope doesn't have it
      });
      it('bit status should throw an error', () => {
        // used to show "Cannot read property 'scope' of null"
        const error = new OutdatedIndexJson('bar/foo', helper.indexJsonPath());
        const statusCmd = () => helper.status();
        helper.expectToThrow(statusCmd, error);
      });
      it('bit ls should throw an error', () => {
        // used to show "Cannot read property 'toBitIdWithLatestVersion' of null"
        const error = new OutdatedIndexJson('bar/foo', helper.indexJsonPath());
        const statusCmd = () => helper.status();
        helper.expectToThrow(statusCmd, error);
      });
    });
  });
});
