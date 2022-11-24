import chai, { expect } from 'chai';
import Helper from '../../src/e2e-helper/e2e-helper';

chai.use(require('chai-fs'));
chai.use(require('chai-string'));

describe('readme env', function () {
  this.timeout(0);
  let helper: Helper;
  before(() => {
    helper = new Helper();
  });
  after(() => {
    helper.scopeHelper.destroy();
  });
  describe('set readme env', () => {
    let docFile;
    before(() => {
      helper.scopeHelper.setNewLocalAndRemoteScopes();
      helper.fixtures.populateComponents(1);
      helper.fs.outputFile('comp1/comp1.docs.mdx');
      helper.command.setEnv('comp1', 'teambit.mdx/readme');
      helper.command.tagAllWithoutBuild();
      const status = helper.command.showComponentParsed('comp1');
      docFile = status.extensions.find((e) => e.name === 'teambit.component/dev-files').data.devFiles[
        'teambit.docs/docs'
      ][0];
    });
    it('should not identify the .docs. file as the docs file', () => {
      expect(docFile).to.not.have.string('comp1.docs.mdx');
    });
    it('should have the index as the docs file entry point', () => {
      expect(docFile).to.have.string('index.js');
    });
    describe('unset readme env and set default env', () => {
      before(() => {
        helper.command.setEnv('comp1', 'teambit.mdx/mdx');
        const status = helper.command.showComponentParsed('comp1');
        docFile = status.extensions.find((e) => e.name === 'teambit.component/dev-files').data.devFiles[
          'teambit.docs/docs'
        ][0];
      });
      it('should identify the .docs. file as the docs file', () => {
        expect(docFile).to.have.string('comp1.docs.mdx');
      });
    });
  });
});
