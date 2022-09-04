import path from 'path';
import chai, { expect } from 'chai';
import { Extensions } from '../../src/constants';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));

describe('bit rename command', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('rename an exported component', () => {
    let scopeAfterExport: string;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.tagAllWithoutBuild();
      helper.command.export();
      scopeAfterExport = helper.scopeHelper.cloneLocalScope();
    });
    describe('rename with no flag', () => {
      before(() => {
        helper.command.rename('comp1', 'comp2');
      });
      it('should create a new component', () => {
        const status = helper.command.statusJson();
        expect(status.newComponents).to.have.lengthOf(1);
      });
      it('should deprecate the original component', () => {
        const showDeprecation = helper.command.showAspectConfig('comp1', Extensions.deprecation);
        expect(showDeprecation.config.deprecate).to.be.true;
        expect(showDeprecation.config).to.have.property('newId');
        expect(showDeprecation.config.newId.name).to.equal('comp2');
      });
      it('should reference the original component in the new component', () => {
        const showDeprecation = helper.command.showAspectConfig('comp2', Extensions.renaming);
        expect(showDeprecation.config).to.have.property('renamedFrom');
        expect(showDeprecation.config.renamedFrom.name).to.equal('comp1');
      });
      it('should list both components', () => {
        const list = helper.command.listParsed();
        const ids = list.map((_) => _.id);
        expect(ids).to.include(`${helper.scopes.remote}/comp1`);
        expect(ids).to.include(`${helper.scopes.remote}/comp2`);
      });
    });
    describe('rename with --scope', () => {
      before(() => {
        helper.scopeHelper.getClonedLocalScope(scopeAfterExport);
        helper.command.rename('comp1', 'comp2', '--scope org.ui');
      });
      it('should save the entered scope as the defaultScope', () => {
        const show = helper.command.showComponentParsedHarmony('comp2');
        const scope = show.find((item) => item.title === 'id');
        expect(scope.json).to.equal('org.ui/comp2');
      });
    });
    describe('rename with invalid name', () => {
      it('should delete the newly created component-dir', () => {
        try {
          helper.command.rename('comp1', 'my.comp'); // the dot is invalid here
        } catch (err: any) {
          expect(err.message).to.have.string('"my.comp" is invalid');
        }
        expect(path.join(helper.scopes.localPath, helper.scopes.remote, 'my.comp')).to.not.be.a.path();
      });
    });
    describe('rename when the path is not empty', () => {
      before(() => {
        helper.fs.outputFile('src/index.ts', 'hello');
      });
      it('should throw an error', () => {
        expect(() => helper.command.rename('comp1', 'comp2', '--path src')).to.throw(
          'unable to create component at "src", this directory is not empty'
        );
      });
    });
  });
  describe('rename a new component', () => {
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopesHarmony();
      helper.bitJsonc.setupDefault();
      helper.fixtures.populateComponents(1);
      helper.command.rename('comp1', 'comp2');
    });
    it('should remove the source component', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap).to.not.have.property('comp1');
    });
    it('should rename the source to the target id', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap).to.have.property('comp2');
    });
    it('workspace should have one component only', () => {
      const list = helper.command.listParsed();
      expect(list).to.have.lengthOf(1);
    });
  });
  describe('rename a new component scope-name', () => {
    before(() => {
      helper.scopeHelper.reInitLocalScopeHarmony();
      helper.fixtures.populateComponents(1);
      helper.command.rename('comp1', 'comp1', '--scope scope2');
    });
    it('should change the defaultScope of the component', () => {
      const bitmap = helper.bitMap.read();
      expect(bitmap.comp1.defaultScope).to.equal('scope2');
    });
  });
});
